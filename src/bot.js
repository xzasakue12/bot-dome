// โหลด dotenv เฉพาะตอน local dev
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { setClient, initializePlayer } = require('./handlers/player');
const { handleVoiceStateUpdate } = require('./handlers/voiceState');
const { loadCommands, handleCommand } = require('./handlers/commandHandler');
const fs = require('fs');
const path = require('path');
const { getYoutubeApiKey } = require('./utils/helpers');

// อ่าน YT_COOKIE จาก Environment Variables (ถ้ามี)
if (process.env.YT_COOKIE) {
    config.ytCookie = process.env.YT_COOKIE;
    console.log('🔑 Loaded YT_COOKIE from environment variable');
}


const youtubeApiKey = getYoutubeApiKey();
if (youtubeApiKey) {
    config.youtubeApiKey = youtubeApiKey;
    console.log('🔑 Loaded YOUTUBE_API_KEY');
} else {
    console.warn('⚠️ YOUTUBE_API_KEY not found. Some features may be unavailable.');
}


// ตรวจสอบไฟล์ cookies.txt หรือ youtube_cookies.txt เฉพาะ Secret Files ของ Render
const possibleCookiesPaths = [
    '/etc/secrets/youtube_cookies.txt',
    '/etc/secrets/cookies.txt'
];

let cookiesPath = null;
for (const p of possibleCookiesPaths) {
    if (fs.existsSync(p)) {
        cookiesPath = p;
        console.log(`✅ Found cookies file at: ${p}`);
        config.cookiesPath = cookiesPath;
        break;
    }
}

if (!cookiesPath) {
    console.warn('⚠️ cookies.txt or youtube_cookies.txt not found. YouTube playback may fail.');
    console.warn('💡 Create cookies.txt or youtube_cookies.txt file to fix YouTube bot detection issues.');
    console.warn('📖 See: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp');
    console.warn('🔧 Ensure your cookies file is up-to-date and valid.');
}

// สร้าง Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// โหลดคำสั่งทั้งหมด
const commands = loadCommands();
console.log(`📋 Loaded ${commands.size} commands`);

// ส่ง client ให้ player handler
setClient(client);

// Event: เมื่อบอทพร้อม
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log('🎵 Music Bot is ready!');
    console.log('✅ Using yt-dlp for YouTube playback');
    client.user.setActivity('!help | Music Bot', { type: 2 });
});

// Event: รับข้อความ
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // ใช้ command handler จัดการทุกคำสั่ง รวมถึง !play
    await handleCommand(message, config.settings.prefix, commands);
});

// Event: voice state update
client.on('voiceStateUpdate', (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState);
});

// Error Handling
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

client.on('rateLimit', (info) => {
    console.warn('Rate limited:', info);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
    console.warn('💡 Check if yt-dlp or cookies are causing the issue.');
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    console.warn('💡 Ensure all dependencies and configurations are correct.');
});

async function startBot() {
    await initializePlayer();
    await client.login(process.env.TOKEN || process.env.DISCORD_BOT_TOKEN);
}

startBot().catch((error) => {
    console.error('Failed to start bot:', error);
    process.exit(1);
});

// Shutdown gracefully
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (config.state.currentConnection) config.state.currentConnection.destroy();
    client.destroy();
    process.exit(0);
});