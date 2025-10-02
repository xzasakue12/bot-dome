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

// ฟังก์ชันสุ่มเพลงจาก YouTube
async function getRandomYouTubeVideo() {
    try {
        // คำค้นหาแนวเพลงต่างๆ ที่นิยม
        const searchQueries = [
            'เพลงไทยเพราะๆ',
            'เพลงสากลเพราะๆ',
            'top hits 2024',
            'popular music',
            'thai pop music',
            'acoustic cover',
            'chill music',
            'lofi hip hop'
        ];
        
        const randomQuery = searchQueries[Math.floor(Math.random() * searchQueries.length)];
        console.log(`🔍 Searching YouTube for: ${randomQuery}`);
        
        const searchResult = await playdl.search(randomQuery, {
            limit: 20,
            source: { youtube: 'video' }
        });
        
        if (searchResult && searchResult.length > 0) {
            const randomIndex = Math.floor(Math.random() * searchResult.length);
            const video = searchResult[randomIndex];
            console.log(`✅ Found random video: ${video.title}`);
            return video.url;
        }
    } catch (e) {
        console.error('❌ Random YouTube search error:', e);
    }
    return null;
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
            console.log('Attempting yt-dlp stream...');
            const ytDlpPath = getYtDlpPath();
            const ytdlpProcess = spawn(ytDlpPath, [
                '-f', 'bestaudio',
                '--no-playlist',
                '-o', '-',
                '--quiet',
                '--no-warnings',
                '--ignore-errors',  // เพิ่มบรรทัดนี้
                cleanUrl
            ], { 
                shell: false, 
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'ignore']  // เปลี่ยนจาก 'pipe' เป็น 'ignore' ตัวสุดท้าย
            });

            ytdlpProcess.on('error', (err) => {
                console.error('yt-dlp process error:', err);
            });

            resource = createAudioResource(ytdlpProcess.stdout, {
                inputType: 'arbitrary',
                inlineVolume: true
            });
            
            console.log('✅ yt-dlp stream started');
            message.reply(`🎵 กำลังเล่น: ${cleanUrl}`);
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
                message.reply(`🎵 กำลังเล่น (play-dl): ${cleanUrl}`);
            } catch (error) {
                console.error('play-dl error:', error.message);
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

    // --- Autoplay: สุ่มจาก YouTube ---
    if (queue.length === 0 && lastVideoId) {
        console.log('🔄 Starting autoplay search...');
        global.nextTimeout = setTimeout(async () => {
            if (queue.length === 0) {
                // สุ่มเพลงจาก YouTube
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
                    queue.push({ 
                        cleanUrl: nextUrl, 
                        voiceChannel, 
                        message: { 
                            reply: (msg) => {
                                const textChannel = guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages'));
                                if (textChannel) {
                                    textChannel.send(`🎲 Autoplay: ${msg}`).catch(e => console.error('Send message error:', e));
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
        }, 3000);
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

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('!play') || message.author.bot) return;

    const urlMatch = message.content.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\S+/i);
    const url = urlMatch ? urlMatch[0].split('&')[0] : null;

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        console.log('URL invalid or not found');
        return message.reply('กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง');
    }

    let videoId;
    let cleanUrl;
    try {
        videoId = playdl.extractID(url);
        cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    } catch (e) {
        console.log('Error extracting videoId:', e);
        return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
    }

    if (!videoId) {
        console.log('No videoId found');
        return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
    }

    const validateResult = playdl.yt_validate(cleanUrl);
    if (validateResult !== 'video') {
        return message.reply('กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง (ต้องเป็นลิงก์วิดีโอเท่านั้น)');
    }

    let info;
    try {
        info = await playdl.video_basic_info(cleanUrl);
        console.log('video_basic_info:', info);
        if (!info || !info.video_details || !info.video_details.id) {
            console.log('video_basic_info: invalid info', info);
            return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
        }
    } catch (e) {
        console.log('video_basic_info error:', e);
        return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
    }

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('คุณต้องอยู่ในห้องเสียงก่อน');

    queue.push({ cleanUrl, voiceChannel, message });
    message.reply('✅ เพิ่มเพลงเข้าคิวแล้ว!');
    
    if (!isPlaying) {
        playNext(voiceChannel.guild.id);
    }
});

client.on('messageCreate', (message) => {
    if (message.content.startsWith('!skip') && !message.author.bot) {
        if (currentPlayer) {
            currentPlayer.stop();
            message.reply('⏭️ ข้ามเพลงแล้ว!');
        } else {
            message.reply('ไม่มีเพลงที่กำลังเล่นอยู่');
        }
    }
});

client.login(process.env.TOKEN);
