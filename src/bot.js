const dotenv = require('dotenv');
dotenv.config({ path: '/etc/secrets/.env' }); // สำหรับ Render
dotenv.config(); // สำหรับเครื่องเรา

const { Client, GatewayIntentBits } = require('discord.js');
const playdl = require('play-dl');
const config = require('./config');
const { setClient } = require('./handlers/player');
const { handleVoiceStateUpdate } = require('./handlers/voiceState');
const { loadCommands, handleCommand } = require('./handlers/commandHandler');
const { exec } = require('child_process');
const fs = require('fs');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');

// สร้าง Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// if (process.env.YOUTUBE_COOKIE) {
//     const cookie = process.env.YOUTUBE_COOKIE;
//     console.log('🔍 Debug: YOUTUBE_COOKIE =', cookie);
//     if (cookie && cookie.includes(';')) {
//         playdl.setToken({ youtube: { cookie: cookie } });
//         console.log('✅ YouTube cookie loaded');
//     } else {
//         console.error('❌ Invalid YouTube cookie format. Ensure it contains key-value pairs separated by semicolons.');
//     }
// } else if (process.env.YOUTUBE_API_KEY) {
//     playdl.setToken({ youtube: { apiKey: process.env.YOUTUBE_API_KEY } });
//     console.log('✅ YouTube API Key loaded');
// }

// โหลดคำสั่งทั้งหมด
const commands = loadCommands();
console.log(`📋 Loaded ${commands.size} commands`);

// ส่ง client ให้ player handler
setClient(client);

// ฟังก์ชันสำหรับใช้ yt-dlp ดึงข้อมูลเสียงจาก YouTube
async function playWithYtDlp(url, message) {
    console.log(`🎵 Attempting to play: ${url}`);

    // Check if the user is in a voice channel
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
        message.reply('❌ คุณต้องอยู่ในห้องเสียงเพื่อใช้คำสั่งนี้');
        return;
    }

    // Join the voice channel
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    // Create an audio player
    const player = createAudioPlayer();

    // Play the audio using yt-dlp
    exec(`./yt-dlp -f bestaudio --cookies /etc/secrets/cookies.txt -o - ${url}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ yt-dlp Error: ${error.message}`);
            message.reply('❌ เกิดข้อผิดพลาดในการดึงข้อมูลเสียง');
            return;
        }
        if (stderr) {
            console.error(`⚠️ yt-dlp Stderr: ${stderr}`);
        }
        console.log(`✅ yt-dlp Output: ${stdout}`);

        // Create an audio resource from the yt-dlp output
        const resource = createAudioResource(stdout.trim()); // ใช้ stdout จาก yt-dlp
        player.play(resource);

        // Subscribe the connection to the audio player
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Playing, () => {
            console.log('🎶 กำลังเล่นเพลง');
            message.reply('🎶 กำลังเล่นเพลงในห้องเสียง');
        });

        player.on(AudioPlayerStatus.Idle, () => {
            console.log('🎵 เพลงจบแล้ว');
            connection.destroy();
        });

        player.on('error', (err) => {
            console.error('❌ Audio Player Error:', err);
            message.reply('❌ เกิดข้อผิดพลาดในการเล่นเพลง');
            connection.destroy();
        });
    });
}

// Event: เมื่อบอทพร้อม
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log('🎵 Music Bot is ready!');
    client.user.setActivity('!help | Music Bot', { type: 2 });
});

// Event: เมื่อได้รับข้อความ
client.on('messageCreate', async (message) => {
    console.log(`📩 Received message: ${message.content}`); // Log ข้อความที่ได้รับ
    if (message.content.startsWith('!play')) {
        const url = message.content.split(' ')[1]; // ดึง URL จากข้อความ
        console.log(`🎵 Attempting to play URL: ${url}`); // Log URL ที่พยายามเล่น
        if (!url) {
            message.reply('❌ โปรดระบุ URL ของ YouTube');
            return;
        }
        await playWithYtDlp(url, message);
    } else {
        await handleCommand(message, config.settings.prefix, commands);
    }
});

// Event: เมื่อมีการเปลี่ยนแปลง voice state
client.on('voiceStateUpdate', (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState);
});

// Error Handling
client.on('error', (error) => console.error('Discord client error:', error));
client.on('rateLimit', (info) => console.warn('Rate limited:', info));

client.login(process.env.TOKEN || process.env.DISCORD_BOT_TOKEN)
    .catch((error) => {
        console.error('Failed to login:', error);
        process.exit(1);
    });

// ปิดบอทอย่างปลอดภัย
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (config.state.currentConnection) config.state.currentConnection.destroy();
    client.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (error) => console.error('Unhandled promise rejection:', error));
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

if (!fs.existsSync('cookies.txt')) {
    console.error('❌ cookies.txt not found. Please upload the file.');
} else {
    console.log('✅ cookies.txt found and ready to use.');
}
