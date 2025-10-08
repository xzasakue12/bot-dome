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
async function playWithYtDlp(url) {
    console.log(`🎵 Attempting to play: ${url}`);
    exec(`./yt-dlp -f bestaudio --cookies cookies.txt ${url}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ yt-dlp Error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`⚠️ yt-dlp Stderr: ${stderr}`);
            return;
        }
        console.log(`✅ yt-dlp Output: ${stdout}`);
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
    if (message.content.startsWith('!play')) {
        const url = message.content.split(' ')[1]; // ดึง URL จากข้อความ
        if (!url) {
            message.reply('❌ โปรดระบุ URL ของ YouTube');
            return;
        }
        await playWithYtDlp(url);
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
