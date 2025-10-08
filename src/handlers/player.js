const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
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
 * เล่นเพลงด้วย yt-dlp (แก้ไขให้รองรับ cookies)
 */
async function playWithYtDlp(cleanUrl, message, connection) {
    return new Promise((resolve, reject) => {
        try {
            // Ensure ytdlpArgs is declared and initialized before use
            const ytdlpArgs = [];

            const ytDlpPath = getYtDlpPath();

            console.log('🎵 Starting yt-dlp stream for:', cleanUrl);

            // Ensure cookiesPath is declared and initialized before use
            let cookiesPath = null;
            for (const p of cookiesPaths) {
                if (p && fs.existsSync(p)) {
                    cookiesPath = p;
                    break;
                }
            }

            // Add cookies and other arguments to ytdlpArgs
            if (cookiesPath) {
                console.log('🍪 Using cookies for authentication:', cookiesPath);
                ytdlpArgs.push('--cookies', cookiesPath);
            } else {
                console.warn('⚠️ No cookies.txt found - YouTube may block requests');
            }

            ytdlpArgs.push(
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                '--add-header', 'Accept-Language:en-US,en;q=0.9',
                '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                '--add-header', 'Sec-Fetch-Mode:navigate',
                '--buffer-size', '32K',
                '--retries', '5',
                '-f', 'bestaudio/best',
                '--no-playlist',
                '--no-warnings',
                '--ignore-errors',
                '--extract-audio',
                '--audio-format', 'opus',
                '-o', '-',
                cleanUrl
            );

            console.log('🔧 yt-dlp command:', ytDlpPath, ytdlpArgs.slice(0, 3).join(' '), '...');

            const ytdlpProcess = spawn(ytDlpPath, ytdlpArgs, {
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

                    // ตรวจจับ bot detection error
                    if (stderrOutput.includes('Sign in to confirm') ||
                        stderrOutput.includes('not a bot') ||
                        stderrOutput.includes('bot detection')) {
                        console.error('🤖 YouTube bot detection triggered!');
                        console.error('💡 Your cookies.txt may be missing, invalid, or expired');
                        console.error('📖 Export new cookies from YouTube: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp');
                    }
                }

                console.log('🔄 yt-dlp process closed. Cleaning up...');
                ffmpegProcess.kill(); // Terminate FFmpeg when yt-dlp finishes
            });

            const bassGain = config.audioSettings?.bassGain || 10; // Default to 10 dB if undefined

            // Adjust FFmpeg arguments to lower bitrate and reduce memory usage
            const ffmpegArgs = [
                '-i', 'pipe:0',
                '-af', `bass=g=${bassGain}`,
                '-b:a', '48k', // Reduced from 64k to 48k
                '-f', 'opus',
                '-hide_banner', '-loglevel', 'error',
                'pipe:1'
            ];

            const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
                shell: false,
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            ytdlpProcess.stdout.pipe(ffmpegProcess.stdin); // Pipe yt-dlp output to FFmpeg

            ffmpegProcess.stderr.on('data', (data) => {
                if (process.env.DEBUG) { // Only log FFmpeg errors in debug mode
                    console.error('FFmpeg error:', data.toString());
                }
            });

            ffmpegProcess.on('error', (err) => {
                console.error('❌ FFmpeg process error:', err);
                if (err.code === 'EPIPE') {
                    console.error('💡 FFmpeg encountered a broken pipe. Ensure the connection is stable.');
                }
                reject(err);
            });

            let retryCount = 0;
            const maxRetries = 3;

            function retryPlay() {
                if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(`🔄 Retrying playback... Attempt ${retryCount}`);
                    playWithYtDlp(cleanUrl, message, connection).catch(retryPlay);
                } else {
                    console.error('❌ Maximum retry attempts reached. Skipping to the next song.');
                    playNext(guildId, lastVideoId);
                }
            }

            ffmpegProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error(`FFmpeg exited with code: ${code}`);
                    retryPlay();
                }
            });

            const resource = createAudioResource(ffmpegProcess.stdout, {
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

        connection.on('error', (error) => {
            console.error('❌ Voice connection error:', error);
            if (error.message.includes('socket closed')) {
                console.error('💡 Socket closed unexpectedly. Retrying connection...');
                // Add retry logic or handle the error appropriately
            }
        });

        connection.on('stateChange', async (oldState, newState) => {
            console.log(`🔄 Voice connection state changed: ${oldState.status} -> ${newState.status}`);

            if (newState.status === 'ready') {
                console.log('✅ Voice connection is ready! Starting playback.');
                try {
                    resource = await playWithYtDlp(cleanUrl, message, connection);
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
                } catch (error) {
                    console.error('❌ Failed to play:', error);
                    message.reply('❌ ไม่สามารถเล่นเพลงนี้ได้');
                    config.state.isPlaying = false;
                    return playNext(guildId, lastVideoId);
                }
            }
        });

        if (!connection || connection.state.status !== 'ready') {
            console.error('❌ Voice connection is not ready. Waiting for readiness.');
            return;
        }

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