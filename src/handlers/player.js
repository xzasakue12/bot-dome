const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { spawn } = require('child_process');
const config = require('../config');
const { getYtDlpPath, checkVoiceChannelEmpty } = require('../utils/helpers');
const { getRandomYouTubeVideo } = require('../utils/youtube');

let client;

function setClient(discordClient) {
    client = discordClient;
}

/**
 * ดึง Video ID จาก YouTube URL
 */
function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        }
        if (urlObj.hostname.includes('youtu.be')) {
            return urlObj.pathname.slice(1);
        }
        return null;
    } catch (e) {
        console.error('Error extracting video ID:', e);
        return null;
    }
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
        
        config.queue.length = 0;
        config.state.isPlaying = false;
        config.state.lastPlayedVideoId = null;
        
        if (config.state.lastTextChannel) {
            config.state.lastTextChannel.send('👋 ไม่มีคนในห้องเสียงแล้ว บอทออกจากห้องแล้วนะ')
                .catch(e => console.error('Send message error:', e));
        }
        return true;
    }
    return false;
}

/**
 * เล่นเพลงด้วย yt-dlp
 */
async function playWithYtDlp(cleanUrl, message, connection) {
    return new Promise((resolve, reject) => {
        try {
            const ytDlpPath = getYtDlpPath();
            
            console.log('🎵 Starting yt-dlp stream for:', cleanUrl);
            
            const ytdlpProcess = spawn(ytDlpPath, [
                '-f', 'bestaudio/best',
                '--no-playlist',
                '--no-warnings',
                '--ignore-errors',
                '--extract-audio',
                '--audio-format', 'opus',
                '-o', '-',
                cleanUrl
            ], { 
                shell: false,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stderrOutput = '';
            
            ytdlpProcess.stderr.on('data', (data) => {
                stderrOutput += data.toString();
            });

            ytdlpProcess.on('error', (err) => {
                console.error('❌ yt-dlp process error:', err);
                reject(err);
            });

            ytdlpProcess.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    console.error('❌ yt-dlp exit code:', code);
                    console.error('stderr:', stderrOutput);
                }
            });

            const resource = createAudioResource(ytdlpProcess.stdout, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) {
                resource.volume.setVolume(0.5);
            }

            console.log('✅ yt-dlp stream created successfully');
            resolve(resource);

        } catch (error) {
            console.error('❌ yt-dlp error:', error);
            reject(error);
        }
    });
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
        
        config.state.currentSong = { cleanUrl, title: title || cleanUrl, voiceChannel };
        
        if (textChannel) {
            config.state.lastTextChannel = textChannel;
        }
        
        let videoId = null;
        try {
            videoId = extractVideoId(cleanUrl);
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
        
        try {
            message.reply(`🎵 กำลังโหลด: **${title || cleanUrl}**`);
            resource = await playWithYtDlp(cleanUrl, message, connection);
        } catch (error) {
            console.error('❌ Failed to play:', error);
            message.reply('❌ ไม่สามารถเล่นเพลงนี้ได้');
            config.state.isPlaying = false;
            return playNext(guildId, lastVideoId);
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
        
        player.play(resource);

        player.on(AudioPlayerStatus.Playing, () => {
            console.log('🎶 Now playing:', title || cleanUrl);
            message.channel.send(`🎶 กำลังเล่น: **${title || cleanUrl}**`)
                .catch(e => console.error('Send error:', e));
        });

        player.on(AudioPlayerStatus.Idle, () => {
            console.log('⏹️ Player idle, playing next...');
            
            if (voiceChannel && checkAndLeaveIfEmpty(voiceChannel)) {
                return;
            }
            
            if (config.loop.mode === 'song' && config.state.currentSong) {
                config.queue.unshift({ 
                    cleanUrl: config.state.currentSong.cleanUrl, 
                    voiceChannel: config.state.currentSong.voiceChannel, 
                    message: { reply: (msg) => {}, channel: message.channel },
                    textChannel: config.state.lastTextChannel,
                    title: config.state.currentSong.title 
                });
            } else if (config.loop.mode === 'queue' && config.queue.length === 0 && config.loop.originalQueue.length > 0) {
                config.loop.originalQueue.forEach(song => config.queue.push({...song}));
            }
            
            playNext(guildId, videoId);
        });

        player.on('error', error => {
            console.error('❌ Audio player error:', error);
            message.channel.send('❌ เกิดข้อผิดพลาดในการเล่นเพลง')
                .catch(e => console.error('Send error:', e));
            playNext(guildId, videoId);
        });

        return;
    }

    // Autoplay
    if (config.queue.length === 0 && lastVideoId && config.settings.autoplayEnabled) {
        console.log('🔄 Starting autoplay...');
        global.nextTimeout = setTimeout(async () => {
            if (config.queue.length === 0) {
                const nextUrl = await getRandomYouTubeVideo();

                let voiceChannel;
                const guild = client.guilds.cache.get(guildId);
                if (guild) {
                    const member = guild.members.me;
                    if (member && member.voice && member.voice.channelId) {
                        voiceChannel = guild.channels.cache.get(member.voice.channelId);
                    }
                }

                if (nextUrl && voiceChannel) {
                    console.log('✅ Adding autoplay song:', nextUrl);
                    config.queue.push({ 
                        cleanUrl: nextUrl, 
                        voiceChannel,
                        textChannel: config.state.lastTextChannel,
                        message: { 
                            reply: (msg) => {
                                if (config.state.lastTextChannel) {
                                    config.state.lastTextChannel.send(`🎲 Autoplay: ${msg}`)
                                        .catch(e => console.error('Send error:', e));
                                }
                            },
                            channel: config.state.lastTextChannel
                        } 
                    });
                    
                    try {
                        config.state.lastPlayedVideoId = extractVideoId(nextUrl);
                    } catch (e) {
                        console.error('Extract ID error:', e);
                    }
                    
                    return playNext(guildId, config.state.lastPlayedVideoId);
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