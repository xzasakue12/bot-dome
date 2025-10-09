const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { getYtDlpPath } = require('../utils/helpers');
const { getRandomYouTubeVideo } = require('../utils/youtube');
const { logOnce, warnOnce, errorOnce } = require('../utils/logger');
const { cleanupProcesses } = require('../services/resourceManager');
const { setupConnectionHandlers } = require('../services/connectionManager');
const { checkAndLeaveIfEmpty } = require('../services/voiceChannelManager');
const { createResourceForTrack, createResourceWithPlayDl } = require('../services/streamFactory');
const extractVideoId = require('../utils/extractVideoId');
const buildYtDlpArgs = require('../utils/buildYtDlpArgs');
const buildFfmpegArgs = require('../utils/buildFfmpegArgs');

let client;

// Connection management
const connectionState = new Map();
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const CONNECTION_TIMEOUT = 20000;
const RECONNECT_DELAY = 3000;

const invalidCookiesPaths = new Set();

function markCookiesPathInvalid(p) {
    if (!p) return;
    invalidCookiesPaths.add(p);
    const idx = cookiesPaths.indexOf(p);
    if (idx !== -1) {
        cookiesPaths.splice(idx, 1);
    }
    if (config.cookiesPath === p) {
        config.cookiesPath = null;
    }
}

function createPlaybackError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
}

// Lock mechanism
const processingGuilds = new Set();

// Define cookiesPaths
const cookiesPaths = [
    path.resolve(__dirname, '../../cookies.txt'),
    path.resolve(__dirname, '../../youtube_cookies.txt'),
    '/etc/secrets/cookies.txt',
    '/etc/secrets/youtube_cookies.txt'
];

// Utility to track logs
const lastLogs = new Map();

function setClient(discordClient) {
    client = discordClient;
}

async function createVoiceConnection(voiceChannel, guildId) {
    try {
        console.log(`🔌 [${guildId}] Creating voice connection...`);
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
            debug: false
        });
        setupConnectionHandlers(connection, guildId, voiceChannel);
        await entersState(connection, VoiceConnectionStatus.Ready, 20000);
        console.log(`✅ [${guildId}] Connection ready`);
        return connection;
    } catch (error) {
        console.error(`❌ [${guildId}] Failed to create connection:`, error);
        throw error;
    }
}

// ก่อนเริ่มบอท
async function validateCookies(cookiesPath) {
    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const { spawn } = require('child_process');
    
    return new Promise((resolve) => {
        const test = spawn(getYtDlpPath(), [
            '--cookies', cookiesPath,
            '--dump-single-json',
            '--no-warnings',
            testUrl
        ]);
        
        let output = '';
        test.stdout.on('data', d => output += d);
        test.stderr.on('data', d => {
            if (d.toString().includes('Sign in')) {
                console.error('❌ Cookies expired! Please update cookies.txt');
                resolve(false);
            }
        });
        
        test.on('close', (code) => {
            if (code === 0 && output) {
                console.log('✅ Cookies are valid');
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

async function initializePlayer() {
    return;
}

async function playWithYtDlp(cleanUrl, message, connection) {
    return new Promise(async (resolve, reject) => {
        let ytdlpProcess;
        let ffmpegProcess;
        let resource;
        let expectedDuration = null;
        let ytdlpBytesReceived = 0;
        let isResolved = false;
        let playbackError = null;
        let finalizeTimer;

        const setPlaybackError = (code, message) => {
            if (!playbackError) {
                playbackError = createPlaybackError(code, message);
            }
            return playbackError;
        };

        const finalize = (err) => {
            if (isResolved) return;
            isResolved = true;
            if (finalizeTimer) {
                clearTimeout(finalizeTimer);
                finalizeTimer = null;
            }

            if (err) {
                cleanupProcesses(ytdlpProcess, ffmpegProcess);
                reject(err);
            } else {
                resolve(resource);
            }
        };

        try {
            const ytdlpArgs = buildYtDlpArgs(cleanUrl);
            const ffmpegArgs = buildFfmpegArgs();

            logOnce('yt-dlp-start', `🎵 Starting yt-dlp stream for: ${cleanUrl}`);

            let cookiesPath = null;
            const baseCandidates = config.cookiesPath ? [config.cookiesPath, ...cookiesPaths] : cookiesPaths;
            for (const p of baseCandidates) {
                if (!p || invalidCookiesPaths.has(p)) continue;
                if (fs.existsSync(p)) {
                    cookiesPath = p;
                    break;
                }
            }

            if (cookiesPath) {
                console.log('🍪 Using cookies for authentication:', cookiesPath);
            } else {
                warnOnce('no-cookies', '⚠️ No cookies.txt found - YouTube may block requests');
            }

            console.log('📊 Fetching video metadata...');
            expectedDuration = await new Promise((resolveMetadata) => {
                const metadataArgs = [
                    '--dump-single-json',
                    '--no-warnings',
                    '--socket-timeout', '10',
                    '--no-check-certificate'
                ];

                if (cookiesPath) {
                    metadataArgs.push('--cookies', cookiesPath);
                }

                metadataArgs.push(cleanUrl);

                const metadataProcess = spawn(getYtDlpPath(), metadataArgs, {
                    shell: false,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    timeout: 8000
                });

                let metadataJson = '';
                let hasResolved = false;

                metadataProcess.stdout.on('data', (data) => {
                    metadataJson += data.toString();
                });

                metadataProcess.stderr.on('data', (data) => {
                    const err = data.toString();
                    if (err.includes('ERROR')) {
                        console.error('⚠️ Metadata error:', err.trim());
                    }
                });

                metadataProcess.on('close', (code) => {
                    if (hasResolved) return;
                    hasResolved = true;

                    if (code === 0 && metadataJson) {
                        try {
                            const metadata = JSON.parse(metadataJson);
                            const duration = Math.round(metadata.duration * 1000);
                            console.log(`📊 Duration from metadata: ${duration}ms (${Math.round(duration/1000)}s)`);
                            resolveMetadata(duration);
                        } catch (e) {
                            console.warn('⚠️ Failed to parse metadata:', e.message);
                            resolveMetadata(300000);
                        }
                    } else {
                        console.warn(`⚠️ Metadata fetch failed (code ${code}), using default`);
                        resolveMetadata(300000);
                    }
                });

                metadataProcess.on('error', (err) => {
                    if (hasResolved) return;
                    hasResolved = true;
                    console.error('⚠️ Metadata process error:', err.message);
                    resolveMetadata(300000);
                });

                setTimeout(() => {
                    if (hasResolved) return;
                    hasResolved = true;
                    console.warn('⚠️ Metadata timeout (3s), using default duration');
                    try {
                        metadataProcess.kill('SIGKILL');
                    } catch (e) {
                        console.error('Kill error:', e.message);
                    }
                    resolveMetadata(300000);
                }, 3000);
            });

            console.log(`✅ Got duration: ${expectedDuration}ms, starting stream...`);
            console.log('🔧 yt-dlp command:', getYtDlpPath(), ytdlpArgs.slice(0, 5).join(' '), '...');

            ytdlpProcess = spawn(getYtDlpPath(), ytdlpArgs, {
                shell: false,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 30000
            });

            ytdlpProcess.stderr.on('data', (data) => {
                const output = data.toString();
                const lines = output.split('\n').filter(l => l.trim());
                lines.forEach(line => {
                    if (line.includes('ERROR') || line.includes('WARNING')) {
                        console.log(`📝 [yt-dlp] ${line.trim()}`);
                    }
                });

                if (output.includes('ERROR:') || output.includes('ERROR')) {
                    console.error('🚨 yt-dlp ERROR:', output.trim());
                }

                if (output.includes('Sign in to confirm') ||
                    output.includes('not a bot') ||
                    output.includes('bot detection')) {
                    console.error('🤖 YouTube bot detection triggered!');
                    console.error('💡 Your cookies.txt may be missing, invalid, or expired');
                    if (cookiesPath) {
                        markCookiesPathInvalid(cookiesPath);
                    }
                    setPlaybackError('YTDLP_BOT_DETECTION', 'YouTube requires additional authentication (update cookies.txt).');
                }
            });

            ytdlpProcess.stdout.on('data', (chunk) => {
                ytdlpBytesReceived += chunk.length;
                if (ytdlpBytesReceived % (1024 * 1024) < chunk.length) {
                    console.log(`📥 Received ${Math.round(ytdlpBytesReceived / 1024 / 1024)}MB`);
                }
            });

            ytdlpProcess.on('error', (err) => {
                if (isResolved) return;
                errorOnce('yt-dlp-error', `❌ yt-dlp process error: ${err}`);
                finalize(setPlaybackError('YTDLP_PROCESS_ERROR', `yt-dlp process error: ${err.message || err}`));
            });

            ytdlpProcess.on('close', (code) => {
                if (isResolved && code === 0) {
                    return;
                }
                console.log(`📊 yt-dlp closed with code ${code}, sent ${ytdlpBytesReceived} bytes`);

                const expectedBytes = expectedDuration ? (expectedDuration / 1000) * 16 * 1024 : 0;
                const bytesPercent = expectedBytes > 0 ? (ytdlpBytesReceived / expectedBytes) * 100 : 0;

                if (ytdlpBytesReceived === 0 || code !== 0) {
                    console.error('❌ yt-dlp sent NO DATA - likely failed to fetch video');
                    if (cookiesPath) {
                        markCookiesPathInvalid(cookiesPath);
                    }
                    finalize(setPlaybackError('YTDLP_NO_DATA', `yt-dlp exited with code ${code}`));
                    return;
                }

                if (bytesPercent < 50) {
                    console.warn(`⚠️ yt-dlp sent only ${bytesPercent.toFixed(1)}% of expected data`);
                }
            });

            ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
                shell: false,
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            resource = createAudioResource(ffmpegProcess.stdout, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) {
                resource.volume.setVolume(0.5);
            }

            let dataReceived = false;

            ffmpegProcess.stdout.once('data', () => {
                if (!dataReceived) {
                    dataReceived = true;
                    console.log('✅ Audio stream receiving data from FFmpeg...');
                    finalize(null);
                }
            });

            ffmpegProcess.stdout.once('readable', () => {
                if (!dataReceived) {
                    console.log('✅ Audio stream ready (readable)');
                }
            });

            resource.metadata = {
                ytdlpProcess,
                ffmpegProcess,
                expectedDuration,
                hasReceivedData: () => dataReceived,
                cleanup: () => cleanupProcesses(ytdlpProcess, ffmpegProcess)
            };

            console.log(`📊 Resource metadata set: expectedDuration=${expectedDuration}ms`);

            ytdlpProcess.stdout.on('error', (err) => {
                if (isResolved) return;
                if (err.code === 'EPIPE') {
                    console.error('⚠️ yt-dlp stdout pipe closed');
                    return;
                }
                console.error('❌ yt-dlp stdout error:', err);
                finalize(setPlaybackError('PIPE_ERROR', `yt-dlp stdout error: ${err.message || err}`));
            });

            ffmpegProcess.stdin.on('error', (err) => {
                if (isResolved) return;
                if (err.code === 'EPIPE') {
                    console.error('⚠️ FFmpeg stdin pipe closed');
                    finalize(setPlaybackError('PIPE_ERROR', 'FFmpeg stdin pipe closed unexpectedly.'));
                    return;
                }
                finalize(setPlaybackError('PIPE_ERROR', `FFmpeg stdin error: ${err.message || err}`));
            });

            ytdlpProcess.stdout.pipe(ffmpegProcess.stdin).on('error', (err) => {
                if (isResolved) return;
                console.error('⚠️ Pipe error:', err);
                finalize(setPlaybackError('PIPE_ERROR', `Pipe error: ${err.message || err}`));
            });

            ffmpegProcess.stderr.on('data', (data) => {
                const errorMsg = data.toString();
                if (errorMsg.toLowerCase().includes('error') ||
                    errorMsg.toLowerCase().includes('invalid data')) {
                    console.error('🚨 FFmpeg ERROR:', errorMsg.trim());
                }
            });

            ffmpegProcess.on('close', (code) => {
                if (!isResolved && code !== 0 && code !== null) {
                    finalize(setPlaybackError('FFMPEG_EXIT', `FFmpeg exited with code: ${code}`));
                    return;
                }
                cleanupProcesses(ytdlpProcess, ffmpegProcess);
            });

            ffmpegProcess.on('error', (err) => {
                if (isResolved) return;
                console.error('❌ FFmpeg process error:', err);
                finalize(setPlaybackError('FFMPEG_PROCESS_ERROR', `FFmpeg process error: ${err.message || err}`));
            });

            console.log('✅ yt-dlp stream created successfully');

            finalizeTimer = setTimeout(() => {
                finalize(playbackError || setPlaybackError('YTDLP_STREAM_TIMEOUT', 'Timed out waiting for audio data.'));
            }, 12000);

        } catch (error) {
            console.error('❌ yt-dlp error:', error);
            finalize(error instanceof Error ? error : new Error(String(error)));
        }
    });
}
async function playNext(guildId, lastVideoId = null) {
    if (processingGuilds.has(guildId)) {
        console.log('⚠️ Already processing next song for this guild, skipping...');
        return;
    }

    // Check if the current player is still playing
    if (config.state.currentPlayer && config.state.currentPlayer.state.status === AudioPlayerStatus.Playing) {
        console.log('⏳ Player is still playing, waiting for it to finish...');
        return;
    }

    processingGuilds.add(guildId);

    try {
        // Check if the previous song ended prematurely
        if (config.state.currentSong && config.state.currentSong.playDuration < 5000) {
            console.warn(`⚠️ Song ended too quickly (${config.state.currentSong.playDuration}ms), retrying...`);
            config.queue.unshift(config.state.currentSong);
            config.state.currentSong = null;
            processingGuilds.delete(guildId);
            return playNext(guildId, lastVideoId);
        }

        // Ensure autoplay only starts after confirming the current song has finished properly
        if (config.queue.length === 0 && config.settings.autoplayEnabled) {
            console.log('🔄 Queue is empty. Autoplay is enabled. Waiting before autoplay...');

            if (config.state.currentSong && config.state.currentSong.hasStartedPlaying) {
                console.log('✅ Current song finished properly. Starting autoplay...');
                const nextUrl = await getRandomYouTubeVideo();

                if (nextUrl) {
                    let autoVideoId = null;
                    try {
                        autoVideoId = extractVideoId(nextUrl);
                    } catch (e) {
                        console.error('Autoplay extract error:', e);
                    }

                    config.queue.push({
                        cleanUrl: nextUrl,
                        voiceChannel: config.state.currentSong.voiceChannel,
                        textChannel: config.state.lastTextChannel,
                        message: { reply: () => {} },
                        title: 'Autoplay Song',
                        sourceType: 'youtube',
                        streamData: null,
                        durationMs: null,
                        videoId: autoVideoId
                    });
                    return playNext(guildId, nextUrl);
                }
            } else {
                console.warn('⚠️ Autoplay delayed due to incomplete song playback.');
            }
        }

        // ยกเลิก timeout ทั้งหมดก่อน
        if (config.state.leaveTimeout) {
            clearTimeout(config.state.leaveTimeout);
            config.state.leaveTimeout = null;
        }
        if (global.nextTimeout) {
            clearTimeout(global.nextTimeout);
            global.nextTimeout = null;
        }

        if (!lastVideoId && config.state.lastPlayedVideoId) {
            lastVideoId = config.state.lastPlayedVideoId;
        }

        if (config.queue.length > 0) {
            config.state.isPlaying = true;
            config.state.isPaused = false;

            const track = config.queue.shift();
            const {
                cleanUrl,
                voiceChannel,
                message,
                textChannel,
                title,
                sourceType,
                durationMs,
                videoId: queuedVideoId
            } = track;

            console.log('🎵 Playing from queue:', title || cleanUrl);

            config.state.currentSong = {
                ...track,
                title: title || cleanUrl,
                voiceChannel
            };

            if (textChannel) {
                config.state.lastTextChannel = textChannel;
            }

            let videoId = queuedVideoId || null;
            try {
                if (!videoId) {
                    videoId = extractVideoId(cleanUrl);
                }
                config.state.lastPlayedVideoId = videoId;
            } catch (e) {
                console.error('Error extracting videoId:', e);
            }

            let connection = config.state.currentConnection;
            const needNewConnection = !connection || 
                connection.state.status === VoiceConnectionStatus.Destroyed ||
                connection.state.status === VoiceConnectionStatus.Disconnected;

            if (needNewConnection) {
                if (connection) {
                    try {
                        connection.destroy();
                    } catch (e) {
                        console.error('Error destroying old connection:', e);
                    }
                }
                
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
                    config.queue.unshift(track);
                    
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
                try {
                    console.log(`⏳ [${guildId}] Waiting for connection to be ready...`);
                    await entersState(connection, VoiceConnectionStatus.Ready, CONNECTION_TIMEOUT);
                    console.log(`✅ [${guildId}] Connection ready`);
                } catch (error) {
                    console.error('❌ Connection not ready:', error);
                    
                    config.state.currentConnection?.destroy();
                    config.state.currentConnection = null;
                    config.state.isPlaying = false;
                    processingGuilds.delete(guildId);
                    config.queue.unshift(track);
                    
                    setTimeout(() => {
                        playNext(guildId, lastVideoId);
                    }, RETRY_DELAY);
                    return;
                }
            }

            let resource;

            try {
                resource = await createResourceForTrack(track, {
                    fallback: async () => playWithYtDlp(cleanUrl, message, connection)
                });
            } catch (error) {
                let finalError = error;
                console.error('❌ Failed to play:', error);

                if (sourceType === 'youtube') {
                    try {
                        console.warn('⚠️ Retrying with play-dl after yt-dlp failure...');
                        resource = await createResourceWithPlayDl(track, {
                            discordPlayerCompatibility: false
                        });
                    } catch (retryError) {
                        finalError = retryError;
                        console.error('❌ play-dl retry failed:', retryError);
                    }
                }

                if (!resource) {
                    if (message && message.channel) {
                        let userMessage = '❌ ไม่สามารถเล่นเพลงนี้ได้';

                        if (sourceType === 'local' && finalError && (finalError.code === 'LOCAL_FILE_MISSING' || finalError.code === 'ENOENT')) {
                            userMessage = '❌ ไม่พบไฟล์เพลงบนเครื่องนี้';
                        } else if (sourceType === 'http-audio') {
                            userMessage = '❌ ไม่สามารถสตรีมไฟล์เสียงนี้ได้';
                        } else if (finalError && finalError.code === 'YTDLP_BOT_DETECTION') {
                            userMessage = '❌ YouTube ต้องการการยืนยันเพิ่มเติม กรุณาอัปโหลด cookies.txt ใหม่ใน Render แล้วลองอีกครั้ง.';
                        } else if (finalError && (finalError.code === 'YTDLP_NO_DATA' || finalError.code === 'YTDLP_STREAM_TIMEOUT')) {
                            userMessage = '❌ ไม่สามารถสตรีมเพลงจาก YouTube ได้ (yt-dlp ไม่มีข้อมูล) โปรดตรวจสอบลิงก์หรืออัปเดต cookies.txt.';
                        } else if (finalError && finalError.message) {
                            userMessage = `❌ ${finalError.message}`;
                        }

                        message.channel.send(userMessage)
                            .catch(e => console.error('Send error:', e));
                    }
                    config.state.currentSong = null;
                    config.state.isPlaying = false;
                    processingGuilds.delete(guildId);
                    return playNext(guildId, lastVideoId);
                }
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

            let hasStartedPlaying = false;
            let playStartTime = null;

            player.once(AudioPlayerStatus.Playing, () => {
                hasStartedPlaying = true;
                playStartTime = Date.now();
                if (config.state.currentSong) {
                    config.state.currentSong.hasStartedPlaying = true;
                    config.state.currentSong.startedAt = playStartTime;
                }
                console.log('🎶 Now playing:', title || cleanUrl);
                console.log(`   Started at: ${new Date().toISOString()}`);
                if (message && message.channel) {
                    message.channel.send(`🎶 กำลังเล่น: **${title || cleanUrl}**`)
                        .catch(e => console.error('Send error:', e));
                }
            });

            player.on(AudioPlayerStatus.Buffering, (oldState, newState) => {
                console.log(`⏸️ Buffering... (from ${oldState.status})`);
            });
            
            console.log('⏳ Waiting for audio stream to be ready...');
            
            let streamReady = false;
            const checkInterval = setInterval(() => {
                if (resource.metadata.hasReceivedData() && !streamReady) {
                    streamReady = true;
                    clearInterval(checkInterval);
                    console.log('✅ Stream ready with data, starting playback');
                    player.play(resource);
                }
            }, 100);
            
            setTimeout(() => {
                if (!streamReady) {
                    streamReady = true;
                    clearInterval(checkInterval);
                    console.warn('⚠️ Stream timeout, starting playback anyway');
                    player.play(resource);
                }
            }, 5000);

            player.on(AudioPlayerStatus.Idle, () => {
                // ยกเลิก autoplay timeout ทุกตัวทันทีเมื่อเพลงจบ
                if (global.nextTimeout) {
                    clearTimeout(global.nextTimeout);
                    global.nextTimeout = null;
                    console.log('⏹️ Cleared all pending autoplay timeouts');
                }
                
                // ป้องกัน multiple idle events
                const idleLockKey = `${guildId}-idle`;
                if (processingGuilds.has(idleLockKey)) {
                    console.log('⚠️ Already processing idle state, skipping...');
                    return;
                }
                processingGuilds.add(idleLockKey);
                
                const playDuration = playStartTime ? Date.now() - playStartTime : 0;
                const durationStr = playDuration > 0 ? `${Math.round(playDuration / 1000)}s` : 'unknown';
                if (config.state.currentSong) {
                    config.state.currentSong.playDuration = playDuration;
                    config.state.currentSong.hasStartedPlaying = config.state.currentSong.hasStartedPlaying || hasStartedPlaying;
                }
                
                console.log(`⏹️ Player idle after ${durationStr}, checking next action...`);
                console.log(`   hasStartedPlaying: ${hasStartedPlaying}, playDuration: ${playDuration}ms`);
                
                // ⭐ เช็คว่าเล่นจริงๆ หรือเปล่า (ใช้ expectedDuration)
               if (resource.metadata?.expectedDuration) {
                    const expectedDuration = resource.metadata.expectedDuration;
                    const percentPlayed = (playDuration / expectedDuration) * 100;
                    
                    console.log(`📊 Played ${Math.round(playDuration/1000)}s / ${Math.round(expectedDuration/1000)}s (${percentPlayed.toFixed(1)}%)`);
                    
                    // ✅ เพิ่มเงื่อนไข: ถ้าเล่นไม่ถึง 75% = มีปัญหา
                    if (percentPlayed < 75 && hasStartedPlaying && playDuration > 10000) {
                        console.warn(`⚠️ Song ended prematurely at ${percentPlayed.toFixed(1)}% - RETRYING`);
                        
                        if (resource.metadata?.cleanup) {
                            resource.metadata.cleanup();
                        }
                        
                        // Retry current song แทนที่จะเล่นเพลงใหม่
                        config.queue.unshift(track);
                        processingGuilds.delete(idleLockKey);
                        processingGuilds.delete(guildId);
                        config.state.isPlaying = false;
                        
                        setTimeout(() => playNext(guildId, videoId), 3000);
                        return;
                    }
                }
                            
                // ตรวจสอบว่า connection ยังใช้งานได้อยู่หรือไม่
                const connectionOk = connection && 
                    connection.state.status === VoiceConnectionStatus.Ready;
                
                if (!connectionOk) {
                    console.warn(`⚠️ Connection lost during playback - attempting recovery`);
                    
                    if (resource.metadata && resource.metadata.cleanup) {
                        try {
                            resource.metadata.cleanup();
                        } catch (e) {
                            console.error('Cleanup error:', e);
                        }
                    }
                    
                    config.queue.unshift(track);
                    config.state.isPlaying = false;
                    processingGuilds.delete(idleLockKey);
                    processingGuilds.delete(guildId);
                    
                    setTimeout(() => {
                        console.log('🔄 Retrying playback after connection recovery...');
                        playNext(guildId, videoId);
                    }, RECONNECT_DELAY);
                    return;
                }
                
                // ⭐ ถ้าเล่นเร็วเกินไป (< 10s) = ไม่ได้เริ่มเล่นจริง
                if (playDuration < 10000 && hasStartedPlaying) {
                    console.warn(`⚠️ Song ended too quickly (${Math.round(playDuration/1000)}s) - RETRYING`);
                    
                    if (resource.metadata && resource.metadata.cleanup) {
                        try {
                            resource.metadata.cleanup();
                        } catch (e) {
                            console.error('Cleanup error:', e);
                        }
                    }
                    
                    // Retry current song
                    config.queue.unshift(track);
                    processingGuilds.delete(idleLockKey);
                    processingGuilds.delete(guildId);
                    config.state.isPlaying = false;
                    
                    setTimeout(() => playNext(guildId, videoId), 2000);
                    return;
                }
                
                // ถ้าไม่ได้เริ่มเล่นเลย
                if (!hasStartedPlaying) {
                    console.warn(`⚠️ Song never started playing - RETRYING`);
                    
                    if (resource.metadata && resource.metadata.cleanup) {
                        try {
                            resource.metadata.cleanup();
                        } catch (e) {
                            console.error('Cleanup error:', e);
                        }
                    }
                    
                    config.queue.unshift(track);
                    processingGuilds.delete(idleLockKey);
                    processingGuilds.delete(guildId);
                    config.state.isPlaying = false;
                    
                    setTimeout(() => playNext(guildId, videoId), 2000);
                    return;
                }

                // ⭐ เล่นจบจริง! 🎉
                console.log(`✅ Song completed successfully`);
                
                if (config.state.currentSong) {
                    console.log(`✅ Finished playing: ${config.state.currentSong.title || config.state.currentSong.cleanUrl}`);
                }

                // Cleanup resources
                if (resource.metadata && resource.metadata.cleanup) {
                    try {
                        resource.metadata.cleanup();
                    } catch (cleanupError) {
                        console.error('❌ Error during resource cleanup:', cleanupError);
                    }
                }

                // เช็คว่ามีเพลงใน queue หรือไม่
                if (config.queue.length > 0) {
                    console.log(`▶️ Found ${config.queue.length} song(s) in queue, playing next...`);
                    processingGuilds.delete(idleLockKey);
                    processingGuilds.delete(guildId);
                    try {
                        playNext(guildId, videoId);
                    } catch (playNextError) {
                        console.error('❌ Error during playNext:', playNextError);
                    }
                    return;
                }

                // ถ้า autoplay ปิดอยู่
                if (!config.settings.autoplayEnabled) {
                    console.log('⏸️ Autoplay is disabled. Stopping playback.');
                    config.state.isPlaying = false;
                    processingGuilds.delete(idleLockKey);
                    processingGuilds.delete(guildId);
                    return;
                }

                // ⭐ เริ่ม autoplay (หลังจากแน่ใจว่าเพลงเล่นจบจริง)
                console.log('🔄 Queue is empty. Autoplay is enabled. Waiting before autoplay...');
                processingGuilds.delete(idleLockKey);
                processingGuilds.delete(guildId);
                
                // ตรวจสอบว่าไม่มี timeout อื่นรออยู่ก่อนสร้างใหม่
                if (global.nextTimeout) {
                    console.log('⚠️ Autoplay timeout already exists, skipping new timeout');
                    return;
                }
                
                const autoplayDelay = config.settings.autoplayDelay || 3000;
                console.log(`⏰ Autoplay will start in ${autoplayDelay}ms (${Math.round(autoplayDelay/1000)}s)`);
                
                global.nextTimeout = setTimeout(async () => {
                    global.nextTimeout = null; // ล้าง timeout หลังทำงาน
                    
                    if (config.queue.length > 0) {
                        console.log('⚠️ Queue has songs now, canceling autoplay');
                        return playNext(guildId, videoId);
                    }

                    console.log('🔄 Starting autoplay...');
                    const nextUrl = await getRandomYouTubeVideo();

                    if (nextUrl && voiceChannel) {
                        console.log('✅ Adding autoplay song:', nextUrl);

                        let autoVideoId = null;
                        try {
                            autoVideoId = extractVideoId(nextUrl);
                            config.state.lastPlayedVideoId = autoVideoId;
                        } catch (e) {
                            console.error('Extract ID error:', e);
                        }

                        config.queue.push({ 
                            cleanUrl: nextUrl, 
                            voiceChannel,
                            textChannel: config.state.lastTextChannel,
                            message: { 
                                reply: () => {},
                                channel: config.state.lastTextChannel
                            },
                            title: 'Autoplay Song',
                            sourceType: 'youtube',
                            streamData: null,
                            durationMs: null,
                            videoId: autoVideoId
                        });

                        return playNext(guildId, config.state.lastPlayedVideoId);
                    } else {
                        console.error('❌ Failed to get autoplay song');
                        config.state.isPlaying = false;
                    }
                }, autoplayDelay);
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
    initializePlayer
};

