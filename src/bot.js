const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { setClient } = require('./handlers/player');
const { handleVoiceStateUpdate } = require('./handlers/voiceState');
const { loadCommands, handleCommand } = require('./handlers/commandHandler');
const fs = require('fs');
const path = require('path');

// โหลด .env
dotenv.config({ path: '/etc/secrets/.env' }); // สำหรับ Render
dotenv.config(); // สำหรับเครื่อง local

// ตรวจสอบไฟล์ cookies.txt
const cookiesPath = path.join('/etc/secrets/cookies.txt'); // สำหรับ Render
if (fs.existsSync(cookiesPath)) {
    console.log('✅ Found cookies.txt file');
    // เก็บ path ใน config เพื่อใช้ใน player
    config.cookiesPath = cookiesPath;
} else {
    console.warn('⚠️ cookies.txt not found. YouTube playback may fail.');
    console.warn('💡 Create cookies.txt file to fix YouTube bot detection issues.');
    console.warn('📖 See: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp');
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
client.on('error', (error) => console.error('Discord client error:', error));
client.on('rateLimit', (info) => console.warn('Rate limited:', info));

// Login
client.login(process.env.TOKEN || process.env.DISCORD_BOT_TOKEN)
    .catch((error) => {
        console.error('Failed to login:', error);
        process.exit(1);
    });

// Shutdown gracefully
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (config.state.currentConnection) config.state.currentConnection.destroy();
    client.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (error) => console.error('Unhandled promise rejection:', error));
process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));