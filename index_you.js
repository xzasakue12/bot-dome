require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const playdl = require('play-dl');
const ytdl = require('ytdl-core');
const { spawn } = require('child_process');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', async () => {
    if (process.env.YT_COOKIE) {
        await playdl.setToken({ youtube: { cookie: process.env.YT_COOKIE } });
        console.log('YouTube cookie loaded!');
    }
    console.log(`Logged in as ${client.user.tag}`);
});

// --- เพิ่มระบบคิวเพลง ---
const queue = [];
let isPlaying = false;
let currentConnection = null;
let currentPlayer = null;
let leaveTimeout = null;
let lastPlayedVideoId = null;

function getYtDlpPath() {
    if (process.platform === 'win32') {
        return path.resolve(__dirname, 'yt-dlp.exe');
    } else {
        return path.resolve(__dirname, 'yt-dlp');
    }
}

async function playNext(guildId, lastVideoId = null) {
    if (leaveTimeout) clearTimeout(leaveTimeout);
    if (global.nextTimeout) clearTimeout(global.nextTimeout);

    // ใช้ lastPlayedVideoId ถ้า lastVideoId ไม่ถูกส่งมา
    if (!lastVideoId && lastPlayedVideoId) {
        lastVideoId = lastPlayedVideoId;
    }

    if (queue.length > 0) {
        // มีเพลงในคิว เล่นทันที ไม่ต้องรอ
        isPlaying = true;
        const { cleanUrl, voiceChannel, message } = queue.shift();
        let videoId = null;
        try {
            videoId = playdl.extractID(cleanUrl);
        } catch {}
        if (videoId) lastPlayedVideoId = videoId;
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });
        currentConnection = connection;
        let resource;
        try {
            let stream;
            try {
                stream = await playdl.stream(cleanUrl);
            } catch (err) {}
            if (stream && stream.stream) {
                resource = createAudioResource(stream.stream, { inputType: stream.type });
            } else {
                try {
                    console.log('yt-dlp path:', getYtDlpPath());
                    const ytdlp = spawn(getYtDlpPath(), [
                        '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
                        '-o', '-',
                        '--no-playlist',
                        '--quiet',
                        '--no-warnings',
                        '--no-check-certificate',
                        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        cleanUrl
                    ], { shell: false, windowsHide: true });
                    
                    ytdlp.stderr.on('data', (data) => {
                        console.error(`yt-dlp error: ${data}`);
                    });
                    
                    ytdlp.on('error', (error) => {
                        console.error(`yt-dlp spawn error: ${error}`);
                        message.reply('ไม่สามารถเล่นเพลงนี้ได้ (yt-dlp spawn error)');
                        connection.destroy();
                        isPlaying = false;
                        return;
                    });
                    
                    resource = createAudioResource(ytdlp.stdout);
                } catch (e) {
                    console.error('yt-dlp creation error:', e);
                    message.reply('ไม่สามารถเล่นเพลงนี้ได้ (yt-dlp error)');
                    connection.destroy();
                    isPlaying = false;
                    return;
                }
            }
            const player = createAudioPlayer();
            currentPlayer = player;
            player.play(resource);
            connection.subscribe(player);
            player.on('error', (err) => {
                // console.error('Audio player error:', err);
            });
            player.on(AudioPlayerStatus.Idle, () => {
                playNext(guildId, videoId);
            });
        } catch (error) {
            message.reply('เกิดข้อผิดพลาดในการเล่นเพลง');
            connection.destroy();
            isPlaying = false;
        }
        return;
    }

    // ถ้าคิวว่าง รอ 15 วิ ถ้าไม่มีใครเพิ่มเพลงใหม่ ให้ autoplay
    if (queue.length === 0) {
        if (lastVideoId) {
            global.nextTimeout = setTimeout(async () => {
                if (queue.length === 0) {
                    // --- Autoplay: หาเพลงแนะนำจาก YouTube ---
                    try {
                        const info = await playdl.video_basic_info(`https://www.youtube.com/watch?v=${lastVideoId}`);
                        let nextUrl = null;
                        if (info && Array.isArray(info.related_videos) && info.related_videos.length > 0) {
                            console.log('related_videos:', info.related_videos);
                            for (const item of info.related_videos) {
                                if (typeof item === 'string' && item.startsWith('https://www.youtube.com/watch?v=')) {
                                    nextUrl = item;
                                    break;
                                } else if (item && typeof item === 'object' && typeof item.url === 'string' && item.url.startsWith('https://www.youtube.com/watch?v=')) {
                                    nextUrl = item.url;
                                    break;
                                }
                            }
                        }
                        if (!nextUrl) {
                            // Fallback: ใช้ ytdl-core เพื่อดึงข้อมูลวิดีโอที่เกี่ยวข้อง (ถ้ามี)
                            try {
                                const ytInfo = await ytdl.getInfo(`https://www.youtube.com/watch?v=${lastVideoId}`);
                                console.log('ytdl-core ytInfo:', ytInfo && ytInfo.related_videos);
                                if (ytInfo && ytInfo.related_videos && ytInfo.related_videos.length > 0) {
                                    for (const rel of ytInfo.related_videos) {
                                        if (rel && rel.id) {
                                            nextUrl = `https://www.youtube.com/watch?v=${rel.id}`;
                                            break;
                                        }
                                    }
                                } else {
                                    console.log('ytdl-core: No related_videos found or related_videos is empty');
                                }
                            } catch (err) {
                                console.log('ytdl-core related_videos error:', err && err.stack ? err.stack : err);
                            }
                        }
                        // Fallback: ถ้ายังไม่มี nextUrl ให้สุ่มจาก fallbackPlaylist
                        if (!nextUrl && fallbackPlaylist.length > 0) {
                            nextUrl = fallbackPlaylist[Math.floor(Math.random() * fallbackPlaylist.length)];
                            console.log('Autoplay fallback: random from fallbackPlaylist', nextUrl);
                        }
                        // --- Fallback: ถ้า currentConnection ไม่มี ให้สร้าง connection ใหม่ ---
                        let voiceChannel;
                        if (currentConnection && currentConnection.joinConfig) {
                            voiceChannel = {
                                id: currentConnection.joinConfig.channelId,
                                guild: { id: currentConnection.joinConfig.guildId, voiceAdapterCreator: currentConnection.joinConfig.adapterCreator }
                            };
                        } else {
                            // หา voice channel id ล่าสุดจาก last connection หรือ guild
                            const guild = client.guilds.cache.get(guildId);
                            if (guild) {
                                const member = guild.members.me;
                                if (member && member.voice && member.voice.channelId) {
                                    voiceChannel = {
                                        id: member.voice.channelId,
                                        guild: { id: guildId, voiceAdapterCreator: guild.voiceAdapterCreator }
                                    };
                                }
                            }
                        }
                        if (nextUrl && voiceChannel) {
                            queue.push({ cleanUrl: nextUrl, voiceChannel, message: { reply: () => {} } });
                            lastPlayedVideoId = playdl.extractID(nextUrl);
                            return playNext(guildId, lastPlayedVideoId);
                        } else {
                            console.log('No related video found for autoplay or cannot find voice channel.');
                        }
                    } catch (e) {
                        console.log('Error fetching related video for autoplay:', e);
                    }
                } else {
                    playNext(guildId);
                }
            }, 15000); // 15 วินาที
            // แจ้งเตือนในแชท (optional)
            if (currentConnection && currentConnection.joinConfig) {
                try {
                    const textChannel = queue[0]?.message?.channel;
                    if (textChannel && typeof textChannel.send === 'function') {
                        textChannel.send('รอ 15 วินาที ถ้าไม่มีเพลงใหม่จะสุ่มเพลงต่อไปให้อัตโนมัติ!');
                    }
                } catch {}
            }
            return;
        }
        // ไม่มีเพลงแนะนำหรือคิวว่างจริง ๆ ค่อย destroy
        if (currentConnection) {
            leaveTimeout = setTimeout(() => {
                if (currentConnection) {
                    currentConnection.destroy();
                    console.log('Left voice channel after 1 minute of inactivity.');
                }
                isPlaying = false;
            }, 60000); // 1 นาที
        }
        isPlaying = false;
        return;
    }
}

// --- Fallback playlist สำหรับ autoplay ---
const fallbackPlaylist = [
    'https://www.youtube.com/watch?v=3JZ_D3ELwOQ', // Example: Mark Ronson - Uptown Funk
    'https://www.youtube.com/watch?v=LsoLEjrDogU', // Example: Daft Punk - Get Lucky
    'https://www.youtube.com/watch?v=fRh_vgS2dFE', // Example: Justin Bieber - Sorry
    'https://www.youtube.com/watch?v=09R8_2nJtjg', // Example: Maroon 5 - Sugar
    'https://www.youtube.com/watch?v=OPf0YbXqDm0', // Example: Mark Ronson - Uptown Funk
    // เพิ่มลิงก์เพลงที่คุณต้องการได้ที่นี่
];

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('!play') || message.author.bot) return;

    // ดึงลิงก์ YouTube แรกที่พบในข้อความ
    const urlMatch = message.content.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\S+/i);
    const url = urlMatch ? urlMatch[0].split('&')[0] : null;
    // console.log('Extracted URL:', url);

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        console.log('URL invalid or not found');
        return message.reply('กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง');
    }
    // ดึง videoId จากลิงก์ YouTube ใด ๆ
    let videoId;
    let cleanUrl;
    try {
        videoId = playdl.extractID(url);
        cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
        // console.log('Extracted videoId:', videoId);
        // console.log('Clean URL:', cleanUrl);
    } catch (e) {
        console.log('Error extracting videoId:', e);
        return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
    }
    if (!videoId) {
        console.log('No videoId found');
        return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
    }
    // ตรวจสอบว่าเป็นลิงก์วิดีโอ YouTube จริง ๆ
    const validateResult = playdl.yt_validate(cleanUrl);
    // console.log('yt_validate result:', validateResult);
    if (validateResult !== 'video') {
        return message.reply('กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง (ต้องเป็นลิงก์วิดีโอเท่านั้น)');
    }
    // ตรวจสอบข้อมูลวิดีโอจากลิงก์ที่สะอาดเท่านั้น
    let info;
    try {
        info = await playdl.video_basic_info(cleanUrl);
        console.log('video_basic_info:', info);
        if (!info || !info.video_details || !info.video_details.id) {
            console.log('video_basic_info: invalid info', info);
            return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
        }
        // cleanUrl = `https://www.youtube.com/watch?v=${info.video_details.id}`; // ไม่ต้องเซ็ตซ้ำ
    } catch (e) {
        console.log('video_basic_info error:', e);
        return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
    }
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('คุณต้องอยู่ในห้องเสียงก่อน');

    // --- เพิ่มเข้า queue ---
    queue.push({ cleanUrl, voiceChannel, message });
    message.reply('กุอยากเพิ่มเพลงแล้วจะทำไหม!');
    if (!isPlaying) {
        playNext(voiceChannel.guild.id);
    }
});

client.on('messageCreate', (message) => {
    if (message.content.startsWith('!skip') && !message.author.bot) {
        if (currentPlayer) {
            currentPlayer.stop(); // จะ trigger playNext() อัตโนมัติ
            message.reply('กุอยากฟังอีกเพลงแล้วไอเวร!');
        } else {
            message.reply('ไม่มีเพลงที่กำลังเล่นอยู่');
        }
    }
});

client.login(process.env.TOKEN);
