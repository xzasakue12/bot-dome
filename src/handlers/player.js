const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { getYtDlpPath, checkVoiceChannelEmpty } = require('../utils/helpers');
const { getRandomYouTubeVideo } = require('../utils/youtube');

let client;

// Connection retry management
let connectionRetries = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Define cookiesPaths to include potential paths for cookies.txt
const cookiesPaths = [
    path.resolve(__dirname, '../../cookies.txt'),
    path.resolve(__dirname, '../../youtube_cookies.txt'),
    '/etc/secrets/cookies.txt'
];

// Utility to track and suppress duplicate logs
const lastLogs = new Map();

function logOnce(key, message) {
    if (lastLogs.get(key) !== message) {
        console.log(message);
        lastLogs.set(key, message);
    }
}

function warnOnce(key, message) {
    if (lastLogs.get(key) !== message) {
        console.warn(message);
        lastLogs.set(key, message);
    }
}

function errorOnce(key, message) {
    if (lastLogs.get(key) !== message) {
        console.error(message);
        lastLogs.set(key, message);
    }
}

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
 * Setup connection event handlers with error recovery
 */
function setupConnectionHandlers(connection, voiceChannel) {
    // Clean up old listeners
    connection.removeAllListeners('stateChange');
    connection.removeAllListeners('error');

    // Setup connection error handler with recovery
    connection.on('error', async (error) => {
        console.error('❌ Voice connection error:', error);
        
        if (error.message.includes('socket closed') || error.message.includes('IP discovery')) {
            console.log('💡 Socket closed - attempting recovery...');
            
            if (connectionRetries < MAX_RETRIES) {
                connectionRetries++;
                console.log(`🔄 Retry attempt ${connectionRetries}/${MAX_RETRIES}`);
                
                // Wait before retry with exponential backoff
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * connectionRetries));
                
                // Destroy old connection and create new one
                try {
                    config.state.currentConnection?.destroy();
                    config.state.currentConnection = null;
                    
                    const newConnection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: voiceChannel.guild.id,
                        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                        selfDeaf: false,
                        selfMute: false,
                        debug: false
                    });
                    
                    config.state.currentConnection = newConnection;
                    setupConnectionHandlers(newConnection, voiceChannel);
                    
                    console.log('✅ Connection recreated successfully');
                } catch (retryError) {
                    console.error('❌ Retry failed:', retryError);
                }
            } else {
                console.error('❌ Max retries reached, giving up');
                connectionRetries = 0;
                
                if (config.state.lastTextChannel) {
                    config.state.lastTextChannel.send('❌ ไม่สามารถเชื่อมต่อห้องเสียงได้ กรุณาลองใหม่อีกครั้ง')
                        .catch(e => console.error('Send error:', e));
                }
            }
        }
    });

    // Setup state change handler
    connection.on('stateChange', (oldState, newState) => {
        const stateChangeKey = `stateChange-${oldState.status}-${newState.status}`;
        logOnce(stateChangeKey, `🔄 Voice connection: ${oldState.status} -> ${newState.status}`);
        
        // Reset retries when connection is ready
        if (newState.status === 'ready') {
            connectionRetries = 0;
            console.log('✅ Connection stable, retries reset');
        }
    });
}

/**
 * เล่นเพลงด้วย yt-dlp (แก้ไขให้รองรับ cookies)
 */
async function playWithYtDlp(cleanUrl, message, connection) {
    return new Promise((resolve, reject) => {
        try {
            const ytdlpArgs = [];
            const ytDlpPath = getYtDlpPath();

            logOnce('yt-dlp-start', `🎵 Starting yt-dlp stream for: ${cleanUrl}`);

            let cookiesPath = null;
            for (const p of cookiesPaths) {
                if (p && fs.existsSync(p)) {
                    cookiesPath = p;
                    break;
                }
            }

            if (cookiesPath) {
                console.log('🍪 Using cookies for authentication:', cookiesPath);
                ytdlpArgs.push('--cookies', cookiesPath);
            } else {
                warnOnce('no-cookies', '⚠️ No cookies.txt found - YouTube may block requests');
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
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 30000
            });

            let stderrOutput = '';

            ytdlpProcess.stderr.on('data', (data) => {
                stderrOutput += data.toString();
            });

            ytdlpProcess.on('error', (err) => {
                errorOnce('yt-dlp-error', `❌ yt-dlp process error: ${err}`);
                reject(err);
            });

            ytdlpProcess.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    console.error('❌ yt-dlp exit code:', code);
                    console.error('stderr:', stderrOutput);

                    if (stderrOutput.includes('Sign in to confirm') ||
                        stderrOutput.includes('not a bot') ||
                        stderrOutput.includes('bot detection')) {
                        console.error('🤖 YouTube bot detection triggered!');
                        console.error('💡 Your cookies.txt may be missing, invalid, or expired');
                    }
                }
            });

            const bassGain = config.audioSettings?.bassGain || 10;

            const ffmpegArgs = [
                '-i', 'pipe:0',
                '-af', `bass=g=${bassGain}`,
                '-b:a', '48k',
                '-f', 'opus',
                '-hide_banner', '-loglevel', 'error',
                'pipe:1'
            ];

            const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
                shell: false,
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            ytdlpProcess.stdout.pipe(ffmpegProcess.stdin);

            ffmpegProcess.stderr.on('data', (data) => {
                if (process.env.DEBUG) {
                    console.error('FFmpeg error:', data.toString());
                }
            });

            ffmpegProcess.on('error', (err) => {
                console.error('❌ FFmpeg process error:', err);
                reject(err);
            });

            ffmpegProcess.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    console.error(`FFmpeg exited with code: ${code}`);
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
 * Wait for voice connection to be ready (เพิ่ม timeout และ better logging)
 */
async function waitForConnectionReady(connection, timeout = 20000) {
    return new Promise((resolve, reject) => {
        if (connection.state.status === 'ready') {
            console.log('✅ Connection already ready');
            return resolve();
        }

        const startTime = Date.now();
        console.log(`⏳ Waiting for connection to be ready (timeout: ${timeout}ms)...`);
        
        const checkInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            
            if (connection.state.status === 'ready') {
                clearInterval(checkInterval);
                console.log(`✅ Connection ready after ${elapsed}ms`);
                resolve();
            } else if (elapsed > timeout) {
                clearInterval(checkInterval);
                console.error(`❌ Connection timeout after ${elapsed}ms`);
                console.error(`   Last status: ${connection.state.status}`);
                reject(new Error(`Voice connection not ready within ${timeout}ms`));
            } else if (elapsed % 5000 === 0) {
                // Log progress every 5 seconds
                console.log(`⏳ Still waiting... ${elapsed}ms elapsed, status: ${connection.state.status}`);
            }
        }, 500); // Check every 500ms instead of 100ms
    });
}

// Lock mechanism to prevent race conditions
let isProcessingNext = false;

/**
 * เล่นเพลงถัดไป (แก้ไขแล้ว - ไม่มีข้อความซ้ำ)
 */
async function playNext(guildId, lastVideoId = null) {
    // Prevent multiple simultaneous calls
    if (isProcessingNext) {
        console.log('⚠️ Already processing next song, skipping duplicate call...');
        return;
    }
    
    isProcessingNext = true;
    
    try {
        if (config.state.leaveTimeout) clearTimeout(config.state.leaveTimeout);
        if (global.nextTimeout) clearTimeout(global.nextTimeout);

        if (!lastVideoId && config.state.lastPlayedVideoId) {
            lastVideoId = config.state.lastPlayedVideoId;
        }

        if (config.queue.length > 0) {
            config.state.isPlaying = true;
            config.state.isPaused = false;
            
            const { cleanUrl, voiceChannel, message, textChannel, title } = config.queue.shift();
            console.log('🎵 Playing from queue:', title || cleanUrl);
            
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

            // Check if already connected to the voice channel
            let connection = config.state.currentConnection;
            if (!connection || connection.state.status === 'destroyed') {
                console.log('🔌 Creating new voice connection...');
                connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: voiceChannel.guild.id,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false,
                    debug: false
                });
                config.state.currentConnection = connection;

                // Setup connection handlers
                setupConnectionHandlers(connection, voiceChannel);
            }

            // Wait for connection to be ready with increased timeout
            try {
                await waitForConnectionReady(connection, 20000);
                console.log('✅ Voice connection ready');
            } catch (error) {
                console.error('❌ Voice connection not ready:', error);
                if (message && message.channel) {
                    message.channel.send('❌ ไม่สามารถเชื่อมต่อห้องเสียงได้ กำลังลองใหม่...')
                        .catch(e => console.error('Send error:', e));
                }
                
                // Retry with new connection
                config.state.currentConnection?.destroy();
                config.state.currentConnection = null;
                config.state.isPlaying = false;
                isProcessingNext = false;
                
                // Re-add to queue and retry
                config.queue.unshift({ cleanUrl, voiceChannel, message, textChannel, title });
                
                setTimeout(() => {
                    playNext(guildId, lastVideoId);
                }, 3000);
                return;
            }

            let resource;
            
            try {
                resource = await playWithYtDlp(cleanUrl, message, connection);
            } catch (error) {
                console.error('❌ Failed to play:', error);
                if (message && message.channel) {
                    message.channel.send('❌ ไม่สามารถเล่นเพลงนี้ได้')
                        .catch(e => console.error('Send error:', e));
                }
                config.state.isPlaying = false;
                isProcessingNext = false;
                return playNext(guildId, lastVideoId);
            }

            if (!resource) {
                console.error('❌ No resource created');
                if (message && message.channel) {
                    message.channel.send('❌ ไม่สามารถสร้าง audio stream ได้')
                        .catch(e => console.error('Send error:', e));
                }
                config.state.isPlaying = false;
                isProcessingNext = false;
                return;
            }

            // Create or reuse player
            let player = config.state.currentPlayer;
            if (!player) {
                player = createAudioPlayer();
                config.state.currentPlayer = player;
                connection.subscribe(player);
            } else {
                // Clean up old listeners
                player.removeAllListeners();
            }
            
            player.play(resource);

            // ส่งข้อความเพียงครั้งเดียวเมื่อเริ่มเล่น
            player.once(AudioPlayerStatus.Playing, () => {
                console.log('🎶 Now playing:', title || cleanUrl);
                if (message && message.channel) {
                    message.channel.send(`🎶 กำลังเล่น: **${title || cleanUrl}**`)
                        .catch(e => console.error('Send error:', e));
                }
            });

            player.on(AudioPlayerStatus.Idle, () => {
                console.log('⏹️ Player idle, playing next...');
                
                if (voiceChannel && checkAndLeaveIfEmpty(voiceChannel)) {
                    isProcessingNext = false;
                    return;
                }
                
                if (config.loop.mode === 'song' && config.state.currentSong) {
                    config.queue.unshift({ 
                        cleanUrl: config.state.currentSong.cleanUrl, 
                        voiceChannel: config.state.currentSong.voiceChannel, 
                        message: { reply: () => {}, channel: message.channel },
                        textChannel: config.state.lastTextChannel,
                        title: config.state.currentSong.title 
                    });
                } else if (config.loop.mode === 'queue' && config.queue.length === 0 && config.loop.originalQueue.length > 0) {
                    config.loop.originalQueue.forEach(song => config.queue.push({...song}));
                }
                
                isProcessingNext = false;
                playNext(guildId, videoId);
            });

            player.on('error', error => {
                console.error('❌ Audio player error:', error);
                if (message && message.channel) {
                    message.channel.send('❌ เกิดข้อผิดพลาดในการเล่นเพลง')
                        .catch(e => console.error('Send error:', e));
                }
                isProcessingNext = false;
                playNext(guildId, videoId);
            });

            isProcessingNext = false;
            return;
        }

        // Autoplay
        if (config.queue.length === 0 && lastVideoId && config.settings.autoplayEnabled) {
            console.log('🔄 Starting autoplay...');
            isProcessingNext = false;
            
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
                                reply: () => {},
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
        isProcessingNext = false;
        
    } catch (error) {
        console.error('❌ Error in playNext:', error);
        isProcessingNext = false;
        throw error;
    }
}

module.exports = {
    setClient,
    playNext,
    checkAndLeaveIfEmpty
};