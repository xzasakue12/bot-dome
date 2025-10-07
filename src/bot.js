require('dotenv').config({ path: '/etc/secrets/.env' }); 
const { Client, GatewayIntentBits } = require('discord.js');
const playdl = require('play-dl');
const config = require('./config');
const { setClient } = require('./handlers/player');
const { handleVoiceStateUpdate } = require('./handlers/voiceState');
const { loadCommands, handleCommand } = require('./handlers/commandHandler');

// สร้าง Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ตั้งค่า play-dl cookie
if (process.env.YOUTUBE_COOKIE) {
    playdl.setToken({
        youtube: {
            apikey: 'AIzaSyDOrOi3nZH-rq4Ie9y6V6CVqo-a0ZhsRgI',
            // cookie: process.env.YOUTUBE_COOKIE
        }
    });
    console.log('✅ YouTube cookie loaded');
}

// โหลดคำสั่งทั้งหมด
const commands = loadCommands();
console.log(`📋 Loaded ${commands.size} commands`);

// ส่ง client ให้ player handler
setClient(client);

// Event: เมื่อบอทพร้อม
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log('🎵 Music Bot is ready!');
    
    // ตั้งค่า status
    client.user.setActivity('!help | Music Bot', { type: 2 }); // 2 = LISTENING
});

// Event: เมื่อได้รับข้อความ
client.on('messageCreate', async (message) => {
    await handleCommand(message, config.settings.prefix, commands);
});

// Event: เมื่อมีการเปลี่ยนแปลง voice state
client.on('voiceStateUpdate', (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState);
});

// Event: เมื่อเกิด error
client.on('error', (error) => {
    console.error('Discord client error:', error);
});

// Event: เมื่อถูก rate limited
client.on('rateLimit', (info) => {
    console.warn('Rate limited:', info);
});

// Login
client.login(process.env.TOKEN || process.env.DISCORD_BOT_TOKEN)
    .catch((error) => {
        console.error('Failed to login:', error);
        process.exit(1);
    });

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    if (config.state.currentConnection) {
        config.state.currentConnection.destroy();
    }
    
    client.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});
