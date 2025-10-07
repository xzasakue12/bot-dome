const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const playdl = require('play-dl');
const { spawn } = require('child_process');
const config = require('../config');
const { getYtDlpPath, checkVoiceChannelEmpty } = require('../utils/helpers');
const { getRandomYouTubeVideo } = require('../utils/youtube');

let client; // จะถูกตั้งค่าจาก index.js

function setClient(discordClient) {
    client = discordClient;
}

/**
 * ฟังก์ชันออกจากห้องเสียงถ้าไม่มีคน
 */
function checkAndLeaveIfEmpty(voiceChannel) {
    if (checkVoiceChannelEmpty(voiceChannel)) {
        console.log('👤 No humans in voice channel, leaving...');
        
        if (config.state.currentConnection) {
            config.state.currentConnection.destroy();
            config.state.currentConnection = null;
        }
        if (config.state.currentPlayer) {
            config.state.currentPlayer.stop();
            config.state.currentPlayer = null;
        }
        
        // ล้างคิว
        config.queue.length = 0;
        config.state.isPlaying = false;
        config.state.lastPlayedVideoId = null;
        
        // ส่งข้อความแจ้งเตือน
        if (config.state.lastTextChannel) {
            config.state.lastTextChannel.send('👋 ไม่มีคนในห้องเสียงแล้ว บอทออกจากห้องแล้วนะ')
                .catch(e => console.error('Send message error:', e));
        }
        return true;
    }
    return false;
}

/**
 * เล่นเพลงถัดไป
 */
async function playNext(guildId, lastVideoId = null) {
    if (config.state.leaveTimeout) clearTimeout(config.state.leaveTimeout);
    if (global.nextTimeout) clearTimeout(global.nextTimeout);

    if (!lastVideoId && config.state.lastPlayedVideoId) {
        lastVideoId = config.state.lastPlayedVideoId;
    }

    if (config.queue.length > 0) {
        config.state.isPlaying = true;
        config.state.isPaused = false;
        
        const { cleanUrl, voiceChannel, message, textChannel, title } = config.queue.shift();
        console.log('🎵 Playing from queue:', cleanUrl);
        
        // เก็บข้อมูลเพลงปัจจุบัน
        config.state.currentSong = { cleanUrl, title: title || cleanUrl, voiceChannel };
        
        // อัปเดตช่องข้อความล่าสุด
        if (textChannel) {
            config.state.lastTextChannel = textChannel;
        }
        
        let videoId = null;
        try {
            videoId = playdl.extractID(cleanUrl);
            config.state.lastPlayedVideoId = videoId;
        } catch (e) {
            console.error('Error extracting videoId:', e);
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });
        config.state.currentConnection = connection;
        
        let resource;
        let stream;
        
        try {
            console.log('Attempting yt-dlp stream...');
            const ytDlpPath = getYtDlpPath();
            const ytdlpProcess = spawn(ytDlpPath, [
                '-f', 'bestaudio',
                '--no-playlist',
                '-o', '-',
                '--quiet',
                '--no-warnings',
                '--ignore-errors',
                cleanUrl
            ], { 
                shell: false, 
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'ignore']
            });

            ytdlpProcess.on('error', (err) => {
                console.error('yt-dlp process error:', err);
            });

            resource = createAudioResource(ytdlpProcess.stdout, {
                inputType: 'arbitrary',
                inlineVolume: true
            });
            
            console.log('✅ yt-dlp stream started');
            message.reply(`🎵 กำลังเล่น: ${title || cleanUrl}`);
        } catch (ytdlpError) {
            console.error('yt-dlp error:', ytdlpError.message);
            
            try {
                console.log('Attempting play-dl stream...');
                stream = await playdl.stream(cleanUrl, { quality: 2 });
                resource = createAudioResource(stream.stream, { 
                    inputType: stream.type,
                    inlineVolume: true 
                });
                console.log('✅ play-dl stream success');
                message.reply(`🎵 กำลังเล่น (play-dl): ${title || cleanUrl}`);
            } catch (error) {
                console.error('play-dl error:', error.message);
                message.reply('❌ ไม่สามารถเล่นเพลงนี้ได้');
                config.state.isPlaying = false;
                return playNext(guildId, lastVideoId);
            }
        }

        if (!resource) {
            console.error('❌ No resource created');
            message.reply('❌ ไม่สามารถสร้าง audio stream ได้');
            config.state.isPlaying = false;
            return playNext(guildId, lastVideoId);
        }

        const player = createAudioPlayer();
        config.state.currentPlayer = player;
        connection.subscribe(player);
        
        console.log('Playing resource...');
        player.play(resource);

        player.on(AudioPlayerStatus.Idle, () => {
            console.log('⏹️ Player idle, playing next...');
            
            // ตรวจสอบว่ายังมีคนในห้องเสียงหรือไม่
            if (voiceChannel && checkAndLeaveIfEmpty(voiceChannel)) {
                return;
            }
            
            // ตรวจสอบ loop mode
            if (config.loop.mode === 'song' && config.state.currentSong) {
                // เล่นเพลงเดิมซ้ำ
                config.queue.unshift({ 
                    cleanUrl: config.state.currentSong.cleanUrl, 
                    voiceChannel: config.state.currentSong.voiceChannel, 
                    message: { reply: (msg) => {} },
                    textChannel: config.state.lastTextChannel,
                    title: config.state.currentSong.title 
                });
            } else if (config.loop.mode === 'queue' && config.queue.length === 0 && config.loop.originalQueue.length > 0) {
                // เมื่อคิวหมด ให้โหลดคิวเดิมกลับมา
                config.loop.originalQueue.forEach(song => config.queue.push({...song}));
            }
            
            playNext(guildId, videoId);
        });

        player.on('error', error => {
            console.error('❌ Audio player error:', error);
            message.reply('❌ เกิดข้อผิดพลาดในการเล่นเพลง');
            playNext(guildId, videoId);
        });

        return;
    }

    // --- Autoplay: สุ่มจาก YouTube ---
    if (config.queue.length === 0 && lastVideoId) {
        console.log('🔄 Starting autoplay search...');
        global.nextTimeout = setTimeout(async () => {
            if (config.queue.length === 0) {
                const nextUrl = await getRandomYouTubeVideo();

                // หา voice channel
                let voiceChannel;
                const guild = client.guilds.cache.get(guildId);
                if (guild) {
                    const member = guild.members.me;
                    if (member && member.voice && member.voice.channelId) {
                        voiceChannel = guild.channels.cache.get(member.voice.channelId);
                    }
                }

                if (nextUrl && voiceChannel) {
                    console.log('✅ Adding autoplay song to queue:', nextUrl);
                    config.queue.push({ 
                        cleanUrl: nextUrl, 
                        voiceChannel,
                        textChannel: config.state.lastTextChannel,
                        message: { 
                            reply: (msg) => {
                                if (config.state.lastTextChannel) {
                                    config.state.lastTextChannel.send(`🎲 Autoplay: ${msg}`)
                                        .catch(e => console.error('Send message error:', e));
                                } else {
                                    const textChannel = guild.channels.cache.find(
                                        ch => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages')
                                    );
                                    if (textChannel) {
                                        textChannel.send(`🎲 Autoplay: ${msg}`)
                                            .catch(e => console.error('Send message error:', e));
                                    }
                                }
                            }
                        } 
                    });
                    
                    try {
                        config.state.lastPlayedVideoId = playdl.extractID(nextUrl);
                    } catch (e) {
                        console.error('Extract ID error:', e);
                    }
                    
                    return playNext(guildId, config.state.lastPlayedVideoId);
                } else {
                    console.log('❌ No next URL or voice channel found');
                }
            }
        }, config.settings.autoplayDelay);
        return;
    }

    // ไม่มีเพลง ออกจากห้อง
    console.log('⏸️ Queue empty, setting leave timeout...');
    if (config.state.currentConnection) {
        config.state.leaveTimeout = setTimeout(() => {
            if (config.state.currentConnection) {
                config.state.currentConnection.destroy();
                console.log('👋 Left voice channel after inactivity');
            }
            config.state.isPlaying = false;
        }, config.settings.leaveTimeout);
    }
    config.state.isPlaying = false;
}

module.exports = {
    setClient,
    playNext,
    checkAndLeaveIfEmpty
};
