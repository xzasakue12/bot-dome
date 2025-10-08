const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { getYtDlpPath, checkVoiceChannelEmpty } = require('../utils/helpers');
const { getRandomYouTubeVideo } = require('../utils/youtube');

let client;

// Connection management - ปรับลดจำนวน retry และลด delay
const connectionState = new Map(); // ใช้ Map แทน global variables
const MAX_RETRIES = 2; // ลดจาก 3 เป็น 2
const RETRY_DELAY = 1500; // ลดจาก 2000 เป็น 1500ms
const CONNECTION_TIMEOUT = 15000; // ลดจาก 25000 เป็น 15000ms

// Lock mechanism
const processingGuilds = new Set();

// Define cookiesPaths
const cookiesPaths = [
    path.resolve(__dirname, '../../cookies.txt'),
    path.resolve(__dirname, '../../youtube_cookies.txt'),
    '/etc/secrets/cookies.txt'
];

// Utility to track logs
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
 * 🔥 แก้ไขหลัก: Connection Handler ใหม่
 */
function setupConnectionHandlers(connection, guildId, voiceChannel) {
    // Clean up old listeners
    connection.removeAllListeners('stateChange');
    connection.removeAllListeners('error');

    // Initialize retry counter for this guild
    if (!connectionState.has(guildId)) {
        connectionState.set(guildId, { retries: 0, lastError: null });
    }

    const state = connectionState.get(guildId);

    // Handle disconnection with improved recovery
    connection.on('stateChange', async (oldState, newState) => {
        console.log(`🔄 [${guildId}] ${oldState.status} → ${newState.status}`);
        
        if (newState.status === VoiceConnectionStatus.Ready) {
            state.retries = 0;
            console.log(`✅ [${guildId}] Connection stable`);
        }
        
        // Handle disconnection
        if (newState.status === VoiceConnectionStatus.Disconnected) {
            try {
                // Try to reconnect quickly
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
                console.log(`✅ [${guildId}] Reconnected successfully`);
            } catch (error) {
                console.error(`❌ [${guildId}] Failed to reconnect:`, error.message);
                
                // Destroy and let retry logic handle it
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                    connection.destroy();
                }
            }
        }
    });

    // Improved error handler
    connection.on('error', async (error) => {
        console.error(`❌ [${guildId}] Voice error:`, error.message);
        state.lastError = error;
        
        // Check if it's a recoverable error
        const isRecoverable = 
            error.message.includes('socket closed') ||
            error.message.includes('IP discovery') ||
            error.message.includes('ECONNRESET') ||
            error.message.includes('ETIMEDOUT');
        
        if (isRecoverable && state.retries < MAX_RETRIES) {
            state.retries++;
            console.log(`🔄 [${guildId}] Retry ${state.retries}/${MAX_RETRIES}`);
            
            // Don't recreate connection here - let the retry logic in playNext handle it
            return;
        }
        
        // Max retries reached or non-recoverable error
        console.error(`❌ [${guildId}] Connection failed (${state.retries} retries)`);
        
        if (config.state.lastTextChannel) {
            config.state.lastTextChannel.send('❌ เกิดปัญหาการเชื่อมต่อ กำลังลองใหม่...')
                .catch(e => console.error('Send error:', e));
        }
        
        // Reset for next attempt
        state.retries = 0;
    });
}

/**
 * 🔥 แก้ไขหลัก: สร้าง Voice Connection ใหม่
 */
async function createVoiceConnection(voiceChannel, guildId) {
    try {
        console.log(`🔌 [${guildId}] Creating voice connection...`);
        
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
            // 🔥 ปิด debug mode
            debug: false
        });
        
        setupConnectionHandlers(connection, guildId, voiceChannel);
        
        // Wait for ready with timeout
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, CONNECTION_TIMEOUT);
            console.log(`✅ [${guildId}] Connection ready`);
            return connection;
        } catch (error) {
            console.error(`❌ [${guildId}] Connection timeout:`, error.message);
            
            // Try one more time if it's in Signalling state
            if (connection.state.status === VoiceConnectionStatus.Signalling) {
                console.log(`🔄 [${guildId}] Waiting for signalling to complete...`);
                await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
                return connection;
            }
            
            throw error;
        }
    } catch (error) {
        console.error(`❌ [${guildId}] Failed to create connection:`, error);
        throw error;
    }
}

async function playWithYtDlp(cleanUrl, message, connection) {
    return new Promise((resolve, reject) => {
        let ytdlpProcess;
        let ffmpegProcess;
        let isResolved = false;
        let hasReceivedData = false;

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

            // Create resource first
            const resource = createAudioResource(ffmpegProcess.stdout, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) {
                resource.volume.setVolume(0.5);
            }

            // Track data reception AFTER resource is created
            let dataReceived = false;
            const originalRead = ffmpegProcess.stdout.read;
            ffmpegProcess.stdout.read = function(...args) {
                if (!dataReceived) {
                    dataReceived = true;
                    console.log('✅ Audio stream receiving data...');
                }
                return originalRead.apply(this, args);
            };

            // Also listen to readable event
            ffmpegProcess.stdout.once('readable', () => {
                if (!dataReceived) {
                    dataReceived = true;
                    console.log('✅ Audio stream ready (readable)');
                }
            });

            // Store processes and stream state
            resource.metadata = {
                ytdlpProcess,
                ffmpegProcess,
                hasReceivedData: () => dataReceived,
                cleanup: () => cleanupProcesses(ytdlpProcess, ffmpegProcess)
            };

            // Handle pipe errors
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

            console.log('✅ yt-dlp stream created successfully');
            
            // Wait a bit for FFmpeg to start processing
            await new Promise(resolve => setTimeout(resolve, 800));
            
            if (!isResolved) {
                isResolved = true;
                resolve(resource);
            }

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
 * 🔥 ลบฟังก์ชัน waitForConnectionReady เดิม ใช้ entersState แทน
 */

async function playNext(guildId, lastVideoId = null) {
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

            // 🔥 ปรับปรุงการจัดการ connection
            let connection = config.state.currentConnection;
            const needNewConnection = !connection || 
                connection.state.status === VoiceConnectionStatus.Destroyed ||
                connection.state.status === VoiceConnectionStatus.Disconnected;

            if (needNewConnection) {
                // Clean up old connection
                if (connection) {
                    try {
                        connection.destroy();
                    } catch (e) {
                        console.error('Error destroying old connection:', e);
                    }
                }
                
                // Create new connection
                try {
                    connection = await createVoiceConnection(voiceChannel, guildId);
                    config.state.currentConnection = connection;
                } catch (error) {
                    console.error('❌ Failed to create voice connection:', error);
                    
                    if (message && message.channel) {
                        message.channel.send('❌ ไม่สามารถเชื่อมต่อห้องเสียงได้ กำลังลองใหม่...')
                            .catch(e => console.error('Send error:', e));
                    }
                    
                    config.state.isPlaying = false;
                    processingGuilds.delete(guildId);
                    
                    // Put song back in queue
                    config.queue.unshift({ cleanUrl, voiceChannel, message, textChannel, title });
                    
                    // Retry after delay
                    const state = connectionState.get(guildId) || { retries: 0 };
                    if (state.retries < MAX_RETRIES) {
                        setTimeout(() => {
                            playNext(guildId, lastVideoId);
                        }, RETRY_DELAY * (state.retries + 1));
                    } else {
                        console.error('❌ Max connection retries reached');
                        state.retries = 0;
                    }
                    return;
                }
            } else if (connection.state.status !== VoiceConnectionStatus.Ready) {
                // Connection exists but not ready, wait for it
                try {
                    console.log(`⏳ [${guildId}] Waiting for connection to be ready...`);
                    await entersState(connection, VoiceConnectionStatus.Ready, CONNECTION_TIMEOUT);
                    console.log(`✅ [${guildId}] Connection ready`);
                } catch (error) {
                    console.error('❌ Connection not ready:', error);
                    
                    // Retry with new connection
                    config.state.currentConnection?.destroy();
                    config.state.currentConnection = null;
                    config.state.isPlaying = false;
                    processingGuilds.delete(guildId);
                    
                    config.queue.unshift({ cleanUrl, voiceChannel, message, textChannel, title });
                    
                    setTimeout(() => {
                        playNext(guildId, lastVideoId);
                    }, RETRY_DELAY);
                    return;
                }
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
            
            // Wait for stream to receive first data chunk
            console.log('⏳ Waiting for audio stream to be ready...');
            
            const waitForStream = new Promise((resolve) => {
                let resolved = false;
                
                // Check every 100ms if data received
                const checkInterval = setInterval(() => {
                    if (resource.metadata.hasReceivedData() && !resolved) {
                        resolved = true;
                        clearInterval(checkInterval);
                        console.log('✅ Stream ready with data, starting playback');
                        resolve();
                    }
                }, 100);
                
                // Timeout after 5 seconds - play anyway
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        clearInterval(checkInterval);
                        console.warn('⚠️ Stream timeout, starting playback anyway');
                        resolve();
                    }
                }, 5000);
            });
            
            // Wait for stream, then play
            await waitForStream;
            player.play(resource);

            // Track if song actually started playing
            let hasStartedPlaying = false;
            let playStartTime = null;

            player.once(AudioPlayerStatus.Playing, () => {
                hasStartedPlaying = true;
                playStartTime = Date.now();
                console.log('🎶 Now playing:', title || cleanUrl);
                console.log(`   Started at: ${new Date().toISOString()}`);
                if (message && message.channel) {
                    message.channel.send(`🎶 กำลังเล่น: **${title || cleanUrl}**`)
                        .catch(e => console.error('Send error:', e));
                }
            });

            // Also log when buffering
            player.on(AudioPlayerStatus.Buffering, (oldState, newState) => {
                console.log(`⏸️ Buffering... (from ${oldState.status})`);
            });

            player.on(AudioPlayerStatus.Idle, () => {
                const playDuration = playStartTime ? Date.now() - playStartTime : 0;
                const durationStr = playDuration > 0 ? `${Math.round(playDuration / 1000)}s` : 'unknown';
                
                console.log(`⏹️ Player idle after ${durationStr}, checking next action...`);
                console.log(`   hasStartedPlaying: ${hasStartedPlaying}, playDuration: ${playDuration}ms`);
                
                // ถ้าเล่นไม่ถึง 5 วินาที แสดงว่าเกิด error หรือยังไม่ได้เล่นจริง
                if (!hasStartedPlaying || playDuration < 5000) {
                    console.warn(`⚠️ Song stopped too quickly (${durationStr}) - possible stream issue`);
                    
                    // Cleanup และลองเล่นเพลงถัดไป
                    if (resource.metadata && resource.metadata.cleanup) {
                        try {
                            resource.metadata.cleanup();
                        } catch (e) {
                            console.error('Cleanup error:', e);
                        }
                    }
                    
                    // ถ้ายังไม่เคยเล่นเลย ให้ retry เพลงเดิม
                    if (!hasStartedPlaying) {
                        console.log('🔄 Retrying current song...');
                        config.queue.unshift({ cleanUrl, voiceChannel, message, textChannel, title });
                    }
                    
                    processingGuilds.delete(guildId);
                    setTimeout(() => playNext(guildId, videoId), 2000);
                    return;
                }

                if (config.state.currentSong) {
                    console.log(`✅ Finished playing: ${config.state.currentSong.title || config.state.currentSong.cleanUrl}`);
                }

                if (resource.metadata && resource.metadata.cleanup) {
                    try {
                        resource.metadata.cleanup();
                    } catch (cleanupError) {
                        console.error('❌ Error during resource cleanup:', cleanupError);
                    }
                }

                if (config.queue.length > 0) {
                    console.log(`▶️ Found ${config.queue.length} song(s) in queue, playing next...`);
                    try {
                        playNext(guildId, videoId);
                    } catch (playNextError) {
                        console.error('❌ Error during playNext:', playNextError);
                    }
                    return;
                }

                if (!config.settings.autoplayEnabled) {
                    console.log('⏸️ Autoplay is disabled. Stopping playback.');
                    config.state.isPlaying = false;
                    return;
                }

                console.log('🔄 Queue is empty. Autoplay is enabled. Waiting before autoplay...');
                global.nextTimeout = setTimeout(async () => {
                    if (config.queue.length > 0) {
                        console.log('⚠️ Queue has songs now, canceling autoplay');
                        return playNext(guildId, videoId);
                    }

                    console.log('🔄 Starting autoplay...');
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
            });

            player.on('error', error => {
                console.error('❌ Audio player error:', error);

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