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

// ตรวจสอบว่ามีคนในห้องเสียงหรือไม่ (ไม่นับบอท)
function checkVoiceChannelEmpty(voiceChannel) {
    if (!voiceChannel) return true;
    
    // นับจำนวนสมาชิกที่ไม่ใช่บอท
    const humanMembers = voiceChannel.members.filter(member => !member.user.bot);
    return humanMembers.size === 0;
}

// ฟังก์ชันออกจากห้องเสียงถ้าไม่มีคน
function checkAndLeaveIfEmpty(voiceChannel) {
    if (checkVoiceChannelEmpty(voiceChannel)) {
        console.log('👤 No humans in voice channel, leaving...');
        if (currentConnection) {
            currentConnection.destroy();
            currentConnection = null;
        }
        if (currentPlayer) {
            currentPlayer.stop();
            currentPlayer = null;
        }
        // ล้างคิว
        queue.length = 0;
        isPlaying = false;
        lastPlayedVideoId = null;
        
        // ส่งข้อความแจ้งเตือน
        if (lastTextChannel) {
            lastTextChannel.send('👋 ไม่มีคนในห้องเสียงแล้ว บอทออกจากห้องแล้วนะ').catch(e => console.error('Send message error:', e));
        }
        return true;
    }
    return false;
}

// --- เพิ่มระบบคิวเพลง ---
const queue = [];
let isPlaying = false;
let currentConnection = null;
let currentPlayer = null;
let leaveTimeout = null;
let lastPlayedVideoId = null;
let lastTextChannel = null; // เก็บช่องข้อความที่ใช้งานล่าสุด
let currentSong = null; // เก็บข้อมูลเพลงที่กำลังเล่น
let isPaused = false; // สถานะ pause

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
        // คำค้นหาแนวเพลง Anime ญี่ปุ่น และ Rap ไทย
        const searchQueries = [
            'anime opening',
            'anime ending',
            'japanese anime song',
            'anime ost',
            'j-pop anime',
            'anime music',
            'แร็พไทย',
            'thai rap',
            'rap thai',
            'ไทยแร็พ',
            'thai hiphop',
            'แร็พเพลงไทย'
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
        isPaused = false;
        const { cleanUrl, voiceChannel, message, textChannel, title } = queue.shift();
        console.log('🎵 Playing from queue:', cleanUrl);
        
        // เก็บข้อมูลเพลงปัจจุบัน
        currentSong = { cleanUrl, title: title || cleanUrl, voiceChannel };
        
        // อัปเดตช่องข้อความล่าสุด
        if (textChannel) {
            lastTextChannel = textChannel;
        }
        
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
            message.reply(`🎵 กำลังเล่น: ${title || cleanUrl}`);
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
                message.reply(`🎵 กำลังเล่น (play-dl): ${title || cleanUrl}`);
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
            
            // ตรวจสอบว่ายังมีคนในห้องเสียงหรือไม่ก่อนเล่นเพลงต่อ
            if (voiceChannel && checkAndLeaveIfEmpty(voiceChannel)) {
                return;
            }
            
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
                        textChannel: lastTextChannel, // ใช้ช่องข้อความเดิม
                        message: { 
                            reply: (msg) => {
                                // ใช้ช่องข้อความที่จำไว้
                                if (lastTextChannel) {
                                    lastTextChannel.send(`🎲 Autoplay: ${msg}`).catch(e => console.error('Send message error:', e));
                                } else {
                                    // Fallback: หาช่องข้อความที่ใช้ได้
                                    const textChannel = guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages'));
                                    if (textChannel) {
                                        textChannel.send(`🎲 Autoplay: ${msg}`).catch(e => console.error('Send message error:', e));
                                    }
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

    // เก็บช่องข้อความที่ใช้งาน
    lastTextChannel = message.channel;

    // ดึงข้อมูลเพลง
    let songTitle = cleanUrl;
    try {
        const videoInfo = await playdl.video_info(cleanUrl);
        if (videoInfo && videoInfo.video_details) {
            songTitle = videoInfo.video_details.title;
        }
    } catch (e) {
        console.log('Cannot get video title:', e);
    }

    queue.push({ cleanUrl, voiceChannel, message, textChannel: message.channel, title: songTitle });
    message.reply(`✅ เพิ่มเพลงเข้าคิวแล้ว: **${songTitle}**`);
    
    if (!isPlaying) {
        playNext(voiceChannel.guild.id);
    }
});

client.on('messageCreate', (message) => {
    if (message.author.bot) return;

    // คำสั่ง !skip
    if (message.content.startsWith('!skip')) {
        if (currentPlayer) {
            currentPlayer.stop();
            message.reply('⏭️ ข้ามเพลงแล้ว!');
        } else {
            message.reply('ไม่มีเพลงที่กำลังเล่นอยู่');
        }
    }

    // คำสั่ง !queue - ดูคิวเพลง
    if (message.content.startsWith('!queue')) {
        if (queue.length === 0 && !currentSong) {
            return message.reply('📭 ไม่มีเพลงในคิว');
        }

        let queueMessage = '📋 **คิวเพลง**\n\n';
        
        if (currentSong) {
            queueMessage += `🎵 **กำลังเล่น:** ${currentSong.title}\n\n`;
        }

        if (queue.length > 0) {
            queueMessage += '**ถัดไป:**\n';
            queue.forEach((song, index) => {
                queueMessage += `${index + 1}. ${song.title || song.cleanUrl}\n`;
            });
            queueMessage += `\n📊 **รวมทั้งหมด:** ${queue.length} เพลง`;
        } else {
            queueMessage += '✨ ไม่มีเพลงถัดไป (Autoplay จะเริ่มทำงาน)';
        }

        message.reply(queueMessage);
    }

    // คำสั่ง !nowplaying - ดูเพลงที่กำลังเล่น
    if (message.content.startsWith('!nowplaying') || message.content.startsWith('!np')) {
        if (!currentSong) {
            return message.reply('ไม่มีเพลงที่กำลังเล่นอยู่');
        }

        message.reply(`🎵 **กำลังเล่น:** ${currentSong.title}\n🔗 ${currentSong.cleanUrl}`);
    }

    // คำสั่ง !stop - หยุดและล้างคิว
    if (message.content.startsWith('!stop')) {
        if (!currentPlayer && queue.length === 0) {
            return message.reply('ไม่มีเพลงที่กำลังเล่นอยู่');
        }

        // ล้างคิว
        queue.length = 0;
        
        // หยุดเล่น
        if (currentPlayer) {
            currentPlayer.stop();
        }

        // ออกจากห้อง
        if (currentConnection) {
            currentConnection.destroy();
            currentConnection = null;
        }

        isPlaying = false;
        currentSong = null;
        lastPlayedVideoId = null;

        message.reply('⏹️ หยุดเล่นและล้างคิวแล้ว!');
    }

    // คำสั่ง !pause - หยุดชั่วคราว
    if (message.content.startsWith('!pause')) {
        if (!currentPlayer) {
            return message.reply('ไม่มีเพลงที่กำลังเล่นอยู่');
        }

        if (isPaused) {
            return message.reply('เพลงถูกหยุดอยู่แล้ว');
        }

        currentPlayer.pause();
        isPaused = true;
        message.reply('⏸️ หยุดเพลงชั่วคราว');
    }

    // คำสั่ง !resume - เล่นต่อ
    if (message.content.startsWith('!resume')) {
        if (!currentPlayer) {
            return message.reply('ไม่มีเพลงที่กำลังเล่นอยู่');
        }

        if (!isPaused) {
            return message.reply('เพลงกำลังเล่นอยู่แล้ว');
        }

        currentPlayer.unpause();
        isPaused = false;
        message.reply('▶️ เล่นเพลงต่อ');
    }

    // คำสั่ง !volume - ปรับระดับเสียง
    if (message.content.startsWith('!volume')) {
        const args = message.content.split(' ');
        
        if (!currentPlayer) {
            return message.reply('ไม่มีเพลงที่กำลังเล่นอยู่');
        }

        if (args.length < 2) {
            return message.reply('กรุณาระบุระดับเสียง (0-100)\nตัวอย่าง: `!volume 50`');
        }

        const volume = parseInt(args[1]);
        
        if (isNaN(volume) || volume < 0 || volume > 100) {
            return message.reply('❌ ระดับเสียงต้องอยู่ระหว่าง 0-100');
        }

        try {
            const resource = currentPlayer.state.resource;
            if (resource && resource.volume) {
                resource.volume.setVolume(volume / 100);
                message.reply(`🔊 ปรับระดับเสียงเป็น ${volume}%`);
            } else {
                message.reply('❌ ไม่สามารถปรับระดับเสียงได้ในขณะนี้');
            }
        } catch (e) {
            console.error('Volume error:', e);
            message.reply('❌ เกิดข้อผิดพลาดในการปรับระดับเสียง');
        }
    }

    // คำสั่ง !help - แสดงความช่วยเหลือ
    if (message.content.startsWith('!help')) {
        const helpMessage = `
🎵 **คำสั่งบอทเพลง Discord** 🎵

**📀 การเล่นเพลง**
\`!play <YouTube URL>\` - เล่นเพลงจาก YouTube
\`!skip\` - ข้ามเพลงปัจจุบัน
\`!stop\` - หยุดเล่นและล้างคิวทั้งหมด
\`!pause\` - หยุดเพลงชั่วคราว
\`!resume\` - เล่นเพลงต่อ

**📋 การจัดการคิว**
\`!queue\` - ดูรายการเพลงในคิว
\`!nowplaying\` หรือ \`!np\` - ดูเพลงที่กำลังเล่น

**🔊 การตั้งค่า**
\`!volume <0-100>\` - ปรับระดับเสียง (ตัวอย่าง: !volume 50)

**✨ ฟีเจอร์พิเศษ**
🎲 **Autoplay** - สุ่มเพลง Anime และแร็พไทยอัตโนมัติ
👋 **Auto-leave** - ออกจากห้องเมื่อไม่มีคนหรือไม่มีเพลง

**💡 เคล็ดลับ**
- บอทจะออกจากห้องอัตโนมัติเมื่อไม่มีคนอยู่
- ระบบ Autoplay จะเริ่มทำงานเมื่อคิวว่าง
        `.trim();
        
        message.reply(helpMessage);
    }
});

// ตรวจจับเมื่อมีคนออกจากห้องเสียง
client.on('voiceStateUpdate', (oldState, newState) => {
    // ตรวจสอบว่าบอทอยู่ในห้องเสียงหรือไม่
    if (!currentConnection) return;
    
    const botMember = newState.guild.members.me;
    if (!botMember || !botMember.voice || !botMember.voice.channel) return;
    
    const botVoiceChannel = botMember.voice.channel;
    
    // ตรวจสอบว่ามีคนออกจากห้องที่บอทอยู่หรือไม่
    if (oldState.channelId === botVoiceChannel.id && newState.channelId !== botVoiceChannel.id) {
        console.log(`👤 User left voice channel: ${oldState.member.user.tag}`);
        
        // รอสักครู่แล้วตรวจสอบว่ายังมีคนหรือไม่
        setTimeout(() => {
            if (checkAndLeaveIfEmpty(botVoiceChannel)) {
                console.log('✅ Bot left because no humans remain');
            }
        }, 2000); // รอ 2 วินาที เผื่อคนกำลังย้ายห้อง
    }
});

client.login(process.env.TOKEN);
