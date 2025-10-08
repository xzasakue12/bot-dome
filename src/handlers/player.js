const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType, VoiceConnectionStatus } = require('@discordjs/voice');
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
const RETRY_DELAY = 2000;

// Lock mechanism to prevent race conditions - ใช้ Set แทน boolean
const processingGuilds = new Set();

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
 * Cleanup processes safely
 */
function cleanupProcesses(ytdlpProcess, ffmpegProcess) {
    try {
        if (ytdlpProcess && !ytdlpProcess.killed) {
            ytdlpProcess.kill('SIGKILL');
        }
    } catch (e) {
        console.error('Error killing yt-dlp:', e);
    }
    
    try {
        if (ffmpegProcess && !ffmpegProcess.killed) {
            ffmpegProcess.kill('SIGKILL');
        }
    } catch (e) {
        console.error('Error killing ffmpeg:', e);
    }
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
        if (newState.status === VoiceConnectionStatus.Ready) {
            connectionRetries = 0;
            console.log('✅ Connection stable, retries reset');
        }
    });
}

/**
 * เล่นเพลงด้วย yt-dlp (แก้ไข EPIPE error)
 */
async function playWithYtDlp(cleanUrl, message, connection) {
    return new Promise((resolve, reject) => {
        let ytdlpProcess;
        let ffmpegProcess;
        let isResolved = false;

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
                '--buffer-size', '64K',
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

            ytdlpProcess = spawn(ytDlpPath, ytdlpArgs, {
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
                if (!isResolved) {
                    isResolved = true;
                    errorOnce('yt-dlp-error', `❌ yt-dlp process error: ${err}`);
                    cleanupProcesses(ytdlpProcess, ffmpegProcess);
                    reject(err);
                }
            });

            ytdlpProcess.on('close', (code) => {
                if (code !== 0 && code !== null && !isResolved) {
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
                '-b:a', '64k',
                '-f', 'opus',
                '-hide_banner', '-loglevel', 'error',
                'pipe:1'
            ];

            ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
                shell: false,
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Handle pipe errors to prevent EPIPE crashes
            ytdlpProcess.stdout.on('error', (err) => {
                if (err.code === 'EPIPE') {
                    console.error('⚠️ yt-dlp stdout pipe closed');
                    cleanupProcesses(ytdlpProcess, ffmpegProcess);
                }
            });

            ffmpegProcess.stdin.on('error', (err) => {
                if (err.code === 'EPIPE') {
                    console.error('⚠️ FFmpeg stdin pipe closed');
                    cleanupProcesses(ytdlpProcess, ffmpegProcess);
                }
            });

            ytdlpProcess.stdout.pipe(ffmpegProcess.stdin).on('error', (err) => {
                console.error('⚠️ Pipe error:', err);
                cleanupProcesses(ytdlpProcess, ffmpegProcess);
            });

            ffmpegProcess.stderr.on('data', (data) => {
                const errorMsg = data.toString();
                if (errorMsg.includes('error') || errorMsg.includes('failed')) {
                    console.error('FFmpeg error:', errorMsg);
                }
            });

            ffmpegProcess.on('error', (err) => {
                if (!isResolved) {
                    console.error('❌ FFmpeg process error:', err);
                    cleanupProcesses(ytdlpProcess, ffmpegProcess);
                    isResolved = true;
                    reject(err);
                }
            });

            ffmpegProcess.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    console.error(`FFmpeg exited with code: ${code}`);
                }
                cleanupProcesses(ytdlpProcess, ffmpegProcess);
            });

            const resource = createAudioResource(ffmpegProcess.stdout, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) {
                resource.volume.setVolume(0.5);
            }

            // Store processes for cleanup later
            resource.metadata = {
                ytdlpProcess,
                ffmpegProcess,
                cleanup: () => cleanupProcesses(ytdlpProcess, ffmpegProcess)
            };

            console.log('✅ yt-dlp stream created successfully');
            isResolved = true;
            resolve(resource);

        } catch (error) {
            if (!isResolved) {
                console.error('❌ yt-dlp error:', error);
                cleanupProcesses(ytdlpProcess, ffmpegProcess);
                reject(error);
            }
        }
    });
}

/**
 * Wait for voice connection to be ready
 */
async function waitForConnectionReady(connection, timeout = 25000) {
    return new Promise((resolve, reject) => {
        if (connection.state.status === VoiceConnectionStatus.Ready) {
            console.log('✅ Connection already ready');
            return resolve();
        }

        const startTime = Date.now();
        console.log(`⏳ Waiting for connection to be ready (timeout: ${timeout}ms)...`);
        
        const checkInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            
            if (connection.state.status === VoiceConnectionStatus.Ready) {
                clearInterval(checkInterval);
                console.log(`✅ Connection ready after ${elapsed}ms`);
                resolve();
            } else if (connection.state.status === VoiceConnectionStatus.Destroyed) {
                clearInterval(checkInterval);
                reject(new Error('Connection was destroyed'));
            } else if (elapsed > timeout) {
                clearInterval(checkInterval);
                console.error(`❌ Connection timeout after ${elapsed}ms`);
                console.error(`   Last status: ${connection.state.status}`);
                reject(new Error(`Voice connection not ready within ${timeout}ms`));
            } else if (elapsed % 5000 === 0) {
                console.log(`⏳ Still waiting... ${elapsed}ms elapsed, status: ${connection.state.status}`);
            }
        }, 500);
    });
}

/**
 * เล่นเพลงถัดไป (แก้ไข race condition)
 */
async function playNext(guildId, lastVideoId = null) {
    // Prevent race conditions using Set
    if (processingGuilds.has(guildId)) {
        console.log('⚠️ Already processing next song for this guild, skipping...');
        return;
    }
    
    processingGuilds.add(guildId);
    
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

            // Check if already connected
            let connection = config.state.currentConnection;
            if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
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
                setupConnectionHandlers(connection, voiceChannel);
            }

            // Wait for connection
            try {
                await waitForConnectionReady(connection, 25000);
                console.log('✅ Voice connection ready');
            } catch (error) {
                console.error('❌ Voice connection not ready:', error);
                if (message && message.channel) {
                    message.channel.send('❌ ไม่สามารถเชื่อมต่อห้องเสียงได้ กำลังลองใหม่...')
                        .catch(e => console.error('Send error:', e));
                }
                
                config.state.currentConnection?.destroy();
                config.state.currentConnection = null;
                config.state.isPlaying = false;
                processingGuilds.delete(guildId);
                
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
                processingGuilds.delete(guildId);
                return playNext(guildId, lastVideoId);
            }

            if (!resource) {
                console.error('❌ No resource created');
                if (message && message.channel) {
                    message.channel.send('❌ ไม่สามารถสร้าง audio stream ได้')
                        .catch(e => console.error('Send error:', e));
                }
                config.state.isPlaying = false;
                processingGuilds.delete(guildId);
                return;
            }

            let player = config.state.currentPlayer;
            if (!player) {
                player = createAudioPlayer();
                config.state.currentPlayer = player;
                connection.subscribe(player);
            } else {
                player.removeAllListeners();
            }
            
            player.play(resource);

            player.once(AudioPlayerStatus.Playing, () => {
                console.log('🎶 Now playing:', title || cleanUrl);
                if (message && message.channel) {
                    message.channel.send(`🎶 กำลังเล่น: **${title || cleanUrl}**`)
                        .catch(e => console.error('Send error:', e));
                }
            });

            player.on(AudioPlayerStatus.Idle, () => {
                console.log('⏹️ Player idle, checking next action...');

                // Check if the current song was played completely
                if (config.state.currentSong) {
                    console.log(`✅ Finished playing: ${config.state.currentSong.title || config.state.currentSong.cleanUrl}`);
                } else {
                    console.warn('⚠️ Player went idle without a current song. Possible error occurred.');
                }

                // Ensure the resource cleanup is not called prematurely
                if (resource.metadata && resource.metadata.cleanup) {
                    try {
                        resource.metadata.cleanup();
                    } catch (cleanupError) {
                        console.error('❌ Error during resource cleanup:', cleanupError);
                    }
                }

                // Check if the queue is empty
                if (config.queue.length === 0) {
                    console.log('🔄 Queue is empty. Checking autoplay settings...');

                    if (config.settings.autoplayEnabled) {
                        console.log('🔄 Autoplay is enabled. Starting autoplay...');
                        global.nextTimeout = setTimeout(async () => {
                            const nextUrl = await getRandomYouTubeVideo();

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
                        }, config.settings.autoplayDelay);
                    } else {
                        console.log('⏸️ Autoplay is disabled. Stopping playback.');
                        config.state.isPlaying = false; // Ensure playback state is updated
                    }

                    return;
                }

                // Play the next song in the queue
                try {
                    playNext(guildId, videoId);
                } catch (playNextError) {
                    console.error('❌ Error during playNext:', playNextError);
                }
            });

            player.on('error', error => {
                console.error('❌ Audio player error:', error);

                // Ensure the resource cleanup is not called prematurely
                if (resource.metadata && resource.metadata.cleanup) {
                    try {
                        resource.metadata.cleanup();
                    } catch (cleanupError) {
                        console.error('❌ Error during resource cleanup:', cleanupError);
                    }
                }

                if (message && message.channel) {
                    message.channel.send('❌ เกิดข้อผิดพลาดในการเล่นเพลง')
                        .catch(e => console.error('Send error:', e));
                }
                processingGuilds.delete(guildId);

                try {
                    playNext(guildId, videoId);
                } catch (playNextError) {
                    console.error('❌ Error during playNext:', playNextError);
                }
            });

            processingGuilds.delete(guildId);
            return;
        }

        // Autoplay
        if (config.queue.length === 0 && lastVideoId && config.settings.autoplayEnabled) {
            console.log('🔄 Starting autoplay...');
            processingGuilds.delete(guildId);
            
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
        processingGuilds.delete(guildId);
        
    } catch (error) {
        console.error('❌ Error in playNext:', error);
        processingGuilds.delete(guildId);
        throw error;
    }
}

module.exports = {
    setClient,
    playNext,
    checkAndLeaveIfEmpty
};