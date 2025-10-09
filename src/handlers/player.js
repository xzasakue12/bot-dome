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

async function playWithYtDlp(cleanUrl, message, connection) {
    return new Promise((resolve, reject) => {
        let ytdlpProcess;
        let ffmpegProcess;
        let isResolved = false;
        let expectedDuration = null;
        let ytdlpBytesReceived = 0;  // ⭐ เพิ่มตัวนับ bytes

        try {
            const ytdlpArgs = buildYtDlpArgs(cleanUrl);
            const ffmpegArgs = buildFfmpegArgs();

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

            console.log('🔧 yt-dlp command:', getYtDlpPath(), ytdlpArgs.slice(0, 5).join(' '), '...');

            ytdlpProcess = spawn(getYtDlpPath(), ytdlpArgs, {
                shell: false,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 30000
            });

            let stderrOutput = '';

            // ⭐ ใช้ --dump-single-json เพื่อดึง metadata ก่อน
            console.log('📊 Fetching video metadata...');
            const metadataArgs = [
                '--dump-single-json',
                '--no-warnings',
                cleanUrl
            ];
            
            if (cookiesPath) {
                metadataArgs.push('--cookies', cookiesPath);
            }
            
            const metadataProcess = spawn(getYtDlpPath(), metadataArgs, {
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            let metadataJson = '';
            metadataProcess.stdout.on('data', (data) => {
                metadataJson += data.toString();
            });
            
            metadataProcess.on('close', (code) => {
                if (code === 0 && metadataJson) {
                    try {
                        const metadata = JSON.parse(metadataJson);
                        expectedDuration = Math.round(metadata.duration * 1000);
                        console.log(`📊 Duration from metadata: ${expectedDuration}ms (${Math.round(expectedDuration/1000)}s)`);
                    } catch (e) {
                        console.warn('⚠️ Failed to parse metadata, using default duration');
                        expectedDuration = 300000;
                    }
                } else {
                    console.warn('⚠️ Failed to fetch metadata, using default duration');
                    expectedDuration = 300000;
                }
            });

            // ⭐ แก้ไข stderr handler - ไม่ต้องดึง duration แล้ว
            ytdlpProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderrOutput += output;
                
                // ⭐ Debug: แสดง stderr เฉพาะที่สำคัญ
                const lines = output.split('\n').filter(l => l.trim());
                lines.forEach(line => {
                    if (line.includes('ERROR') || line.includes('WARNING')) {
                        console.log(`📝 [yt-dlp] ${line.trim()}`);
                    }
                });
                
                // ตรวจสอบ errors
                if (output.includes('ERROR:') || output.includes('ERROR')) {
                    console.error('🚨 yt-dlp ERROR:', output.trim());
                }
                
                // ตรวจสอบ bot detection
                if (output.includes('Sign in to confirm') ||
                    output.includes('not a bot') ||
                    output.includes('bot detection')) {
                    console.error('🤖 YouTube bot detection triggered!');
                    console.error('💡 Your cookies.txt may be missing, invalid, or expired');
                }
            });

            // ⭐ เพิ่มการตรวจสอบ stdout bytes
                ytdlpProcess.stdout.on('data', (chunk) => {
                    ytdlpBytesReceived += chunk.length;
                
                // ⭐ แสดง progress ทุก 1MB
                    if (ytdlpBytesReceived % (1024 * 1024) < chunk.length) {
                     console.log(`📥 Received ${Math.round(ytdlpBytesReceived / 1024 / 1024)}MB`);
                    }
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
                console.log(`📊 yt-dlp closed with code ${code}, sent ${ytdlpBytesReceived} bytes`);
                
                const expectedBytes = expectedDuration ? (expectedDuration / 1000) * 16 * 1024 : 0;
                const bytesPercent = expectedBytes > 0 ? (ytdlpBytesReceived / expectedBytes) * 100 : 0;
                
                if (ytdlpBytesReceived === 0) {
                    console.error('❌ yt-dlp sent NO DATA - likely failed to fetch video');
                } else if (bytesPercent < 50) {
                    console.warn(`⚠️ yt-dlp sent only ${bytesPercent.toFixed(1)}% of expected data`);
                }
            });

            ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
                shell: false,
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const resource = createAudioResource(ffmpegProcess.stdout, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) {
                resource.volume.setVolume(0.5);
            }

            let dataReceived = false;
            const originalRead = ffmpegProcess.stdout.read;
            ffmpegProcess.stdout.read = function(...args) {
                if (!dataReceived) {
                    dataReceived = true;
                    console.log('✅ Audio stream receiving data from FFmpeg...');
                }
                return originalRead.apply(this, args);
            };

            ffmpegProcess.stdout.once('readable', () => {
                if (!dataReceived) {
                    dataReceived = true;
                    console.log('✅ Audio stream ready (readable)');
                }
            });

            // ⭐ ลบ timeout สำหรับ duration (ดึงจาก metadata แล้ว)

            resource.metadata = {
                ytdlpProcess,
                ffmpegProcess,
                expectedDuration,
                hasReceivedData: () => dataReceived,
                cleanup: () => cleanupProcesses(ytdlpProcess, ffmpegProcess)
            };

            ytdlpProcess.stdout.on('error', (err) => {
                if (err.code === 'EPIPE') {
                    console.error('⚠️ yt-dlp stdout pipe closed');
                    return;
                }
                console.error('❌ yt-dlp stdout error:', err);
                cleanupProcesses(ytdlpProcess, ffmpegProcess);
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

            // ⭐ แสดง FFmpeg stderr เฉพาะ errors
            ffmpegProcess.stderr.on('data', (data) => {
                const errorMsg = data.toString();
                // เฉพาะ errors ที่สำคัญ
                if (errorMsg.toLowerCase().includes('error') || 
                    errorMsg.toLowerCase().includes('invalid data')) {
                    console.error('🚨 FFmpeg ERROR:', errorMsg.trim());
                }
            });

            ffmpegProcess.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    console.error(`❌ FFmpeg exited with code: ${code}`);
                }
                cleanupProcesses(ytdlpProcess, ffmpegProcess);
            });

            ffmpegProcess.on('error', (err) => {
                console.error('❌ FFmpeg process error:', err);
                cleanupProcesses(ytdlpProcess, ffmpegProcess);
            });

            console.log('✅ yt-dlp stream created successfully');
            
            setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    resolve(resource);
                }
            }, 800);

        } catch (error) {
            if (!isResolved) {
                console.error('❌ yt-dlp error:', error);
                cleanupProcesses(ytdlpProcess, ffmpegProcess);
                reject(error);
            }
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
                    config.queue.push({
                        cleanUrl: nextUrl,
                        voiceChannel: config.state.currentSong.voiceChannel,
                        textChannel: config.state.lastTextChannel,
                        message: { reply: () => {} },
                        title: 'Autoplay Song'
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
                    config.queue.unshift({ cleanUrl, voiceChannel, message, textChannel, title });
                    
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
                        config.queue.unshift({ cleanUrl, voiceChannel, message, textChannel, title });
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
                    
                    config.queue.unshift({ cleanUrl, voiceChannel, message, textChannel, title });
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
                    config.queue.unshift({ cleanUrl, voiceChannel, message, textChannel, title });
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
                    
                    config.queue.unshift({ cleanUrl, voiceChannel, message, textChannel, title });
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
                        config.queue.push({ 
                            cleanUrl: nextUrl, 
                            voiceChannel,
                            textChannel: config.state.lastTextChannel,
                            message: { 
                                reply: () => {},
                                channel: config.state.lastTextChannel
                            },
                            title: 'Autoplay Song'
                        });

                        try {
                            config.state.lastPlayedVideoId = extractVideoId(nextUrl);
                        } catch (e) {
                            console.error('Extract ID error:', e);
                        }

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
    playNext
};