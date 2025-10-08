const dotenv = require('dotenv');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const playdl = require('play-dl');
const config = require('./config');
const { setClient } = require('./handlers/player');
const { handleVoiceStateUpdate } = require('./handlers/voiceState');
const { loadCommands, handleCommand } = require('./handlers/commandHandler');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');

// โหลด .env
dotenv.config({ path: '/etc/secrets/.env' }); // สำหรับ Render
dotenv.config(); // สำหรับเครื่อง local

// สร้าง Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ตั้งค่า play-dl: ใช้ cookies.txt บนเครื่อง local, API Key บน Render
if (fs.existsSync('cookies.txt')) {
    const cookie = fs.readFileSync('cookies.txt', 'utf8');
    if (cookie && cookie.includes(';')) {
        playdl.setToken({ youtube: { cookie } });
        console.log('✅ YouTube cookie loaded (local)');
    } else {
        console.error('❌ Invalid cookies.txt format');
    }
} else if (process.env.YOUTUBE_API_KEY) {
    playdl.setToken({ youtube: { apiKey: process.env.YOUTUBE_API_KEY } });
    console.log('✅ YouTube API Key loaded (Render)');
} else {
    console.warn('⚠️ No YouTube credentials found. Play commands will fail.');
}

// โหลดคำสั่งทั้งหมด
const commands = loadCommands();
console.log(`📋 Loaded ${commands.size} commands`);

// ส่ง client ให้ player handler
setClient(client);

// ฟังก์ชันเล่นเพลงด้วย play-dl
async function playMusic(url, message) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
        message.reply('❌ คุณต้องอยู่ในห้องเสียงเพื่อใช้คำสั่งนี้');
        return;
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    try {
        const stream = await playdl.stream(url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });

        const player = createAudioPlayer();
        player.play(resource);
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

    } catch (err) {
        console.error('❌ play-dl error:', err);
        message.reply('❌ เกิดข้อผิดพลาดในการดึงเพลง');
    }
}

// Event: เมื่อบอทพร้อม
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log('🎵 Music Bot is ready!');
    client.user.setActivity('!help | Music Bot', { type: 2 });
});

// Event: รับข้อความ
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!play')) {
        const url = message.content.split(' ')[1];
        if (!url) {
            message.reply('❌ โปรดระบุ URL ของ YouTube');
            return;
        }
        await playMusic(url, message);
    } else {
        await handleCommand(message, config.settings.prefix, commands);
    }
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
