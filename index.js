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

    if (!lastVideoId && lastPlayedVideoId) {
        lastVideoId = lastPlayedVideoId;
    }

    if (queue.length > 0) {
        isPlaying = true;
        const { cleanUrl, voiceChannel, message } = queue.shift();
        console.log('🎵 Playing from queue:', cleanUrl);
        
        let videoId = null;
        try {
            videoId = playdl.extractID(cleanUrl);
            lastPlayedVideoId = videoId;
        } catch (e) {
            console.error('Error extracting videoId:', e);
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });
        currentConnection = connection;
        
        let resource;
        let stream;
        
        try {
            console.log('Attempting play-dl stream...');
            stream = await playdl.stream(cleanUrl, { quality: 2 });
            resource = createAudioResource(stream.stream, { 
                inputType: stream.type,
                inlineVolume: true 
            });
            console.log('✅ play-dl stream success');
            message.reply(`🎵 กำลังเล่น: ${cleanUrl}`);
        } catch (error) {
            console.error('play-dl error:', error.message);
            
            // Fallback to yt-dlp
            try {
                console.log('Attempting yt-dlp stream...');
                const ytDlpPath = getYtDlpPath();
                const ytdlpProcess = spawn(ytDlpPath, [
                    '-f', 'bestaudio',
                    '--no-playlist',
                    '-o', '-',
                    '--quiet',
                    '--no-warnings',
                    cleanUrl
                ], { 
                    shell: false, 
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                ytdlpProcess.stderr.on('data', (data) => {
                    console.error(`yt-dlp stderr: ${data}`);
                });

                ytdlpProcess.on('error', (err) => {
                    console.error('yt-dlp process error:', err);
                });

                resource = createAudioResource(ytdlpProcess.stdout, {
                    inputType: 'arbitrary',
                    inlineVolume: true
                });
                
                console.log('✅ yt-dlp stream started');
                message.reply(`🎵 กำลังเล่น (yt-dlp): ${cleanUrl}`);
            } catch (ytdlpError) {
                console.error('yt-dlp creation error:', ytdlpError);
                message.reply('❌ ไม่สามารถเล่นเพลงนี้ได้');
                isPlaying = false;
                return playNext(guildId, lastVideoId);
            }
        }

        if (!resource) {
            console.error('❌ No resource created');
            message.reply('❌ ไม่สามารถสร้าง audio stream ได้');
            isPlaying = false;
            return playNext(guildId, lastVideoId);
        }

        const player = createAudioPlayer();
        currentPlayer = player;
        connection.subscribe(player);
        
        console.log('Playing resource...');
        player.play(resource);

        player.on(AudioPlayerStatus.Idle, () => {
            console.log('⏹️ Player idle, playing next...');
            playNext(guildId, videoId);
        });

        player.on('error', error => {
            console.error('❌ Audio player error:', error);
            message.reply('❌ เกิดข้อผิดพลาดในการเล่นเพลง');
            playNext(guildId, videoId);
        });

        return;
    }

    // --- Autoplay ---
    if (queue.length === 0 && lastVideoId) {
        console.log('🔄 Starting autoplay search...');
        global.nextTimeout = setTimeout(async () => {
            if (queue.length === 0) {
                let nextUrl = null;
                
                // Fallback: สุ่มจาก playlist
                if (fallbackPlaylist.length > 0) {
                    nextUrl = fallbackPlaylist[Math.floor(Math.random() * fallbackPlaylist.length)];
                    console.log('🎲 Autoplay fallback: random from playlist', nextUrl);
                }

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
                    queue.push({ 
                        cleanUrl: nextUrl, 
                        voiceChannel, 
                        message: { 
                            reply: (msg) => {
                                const textChannel = guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages'));
                                if (textChannel) {
                                    textChannel.send(`🎵 Autoplay: ${msg}`).catch(e => console.error('Send message error:', e));
                                }
                            }
                        } 
                    });
                    
                    try {
                        lastPlayedVideoId = playdl.extractID(nextUrl);
                    } catch (e) {
                        console.error('Extract ID error:', e);
                    }
                    
                    return playNext(guildId, lastPlayedVideoId);
                } else {
                    console.log('❌ No next URL or voice channel found');
                }
            }
        }, 3000); // ลดเวลารอเหลือ 3 วินาที
        return;
    }

    // ไม่มีเพลง ออกจากห้อง
    console.log('⏸️ Queue empty, setting leave timeout...');
    if (currentConnection) {
        leaveTimeout = setTimeout(() => {
            if (currentConnection) {
                currentConnection.destroy();
                console.log('👋 Left voice channel after inactivity');
            }
            isPlaying = false;
        }, 60000);
    }
    isPlaying = false;
}

// ฟังก์ชันช่วย: search เพลงจาก channel
async function searchRandomFromChannel(channelId) {
    try {
        const searchResult = await playdl.search(`https://www.youtube.com/channel/${channelId}/videos`, {
            limit: 10,
            source: { youtube: 'video' }
        });
        
        if (searchResult && searchResult.length > 0) {
            const randomIndex = Math.floor(Math.random() * searchResult.length);
            return searchResult[randomIndex].url;
        }
    } catch (e) {
        console.log('Search channel error:', e);
    }
    return null;
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
