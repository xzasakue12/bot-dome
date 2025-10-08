const dotenv = require('dotenv');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { setClient } = require('./handlers/player');
const { handleVoiceStateUpdate } = require('./handlers/voiceState');
const { loadCommands, handleCommand } = require('./handlers/commandHandler');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');

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

// โหลดคำสั่งทั้งหมด
const commands = loadCommands();
console.log(`📋 Loaded ${commands.size} commands`);

// ส่ง client ให้ player handler
setClient(client);

// ฟังก์ชันเล่นเพลงด้วย ytdl-core
async function playMusic(url, message) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
        message.reply('❌ คุณต้องอยู่ในห้องเสียงเพื่อใช้คำสั่งนี้');
        return;
    }

    // ตรวจสอบว่าเป็น YouTube URL หรือไม่
    if (!ytdl.validateURL(url)) {
        message.reply('❌ URL ไม่ถูกต้อง โปรดใช้ลิงก์ YouTube');
        return;
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    try {
        // ดึงข้อมูลเพลง
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title;
        
        message.reply(`🎵 กำลังโหลด: **${title}**`);

        // สร้าง stream
        const stream = ytdl(url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25,
            dlChunkSize: 0
        });

        const resource = createAudioResource(stream, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });

        const player = createAudioPlayer();
        
        // ตั้งค่า volume เริ่มต้น
        if (resource.volume) {
            resource.volume.setVolume(0.5);
        }

        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Playing, () => {
            console.log(`🎶 กำลังเล่น: ${title}`);
            message.channel.send(`🎶 กำลังเล่น: **${title}**`);
        });

        player.on(AudioPlayerStatus.Idle, () => {
            console.log('🎵 เพลงจบแล้ว');
            connection.destroy();
        });

        player.on('error', (err) => {
            console.error('❌ Audio Player Error:', err);
            message.channel.send('❌ เกิดข้อผิดพลาดในการเล่นเพลง');
            connection.destroy();
        });

        // จัดการ error ของ stream
        stream.on('error', (err) => {
            console.error('❌ Stream Error:', err);
            message.channel.send('❌ เกิดข้อผิดพลาดในการดึงข้อมูลเพลง');
            if (connection) connection.destroy();
        });

    } catch (err) {
        console.error('❌ ytdl-core error:', err);
        
        let errorMsg = '❌ เกิดข้อผิดพลาดในการเล่นเพลง';
        
        if (err.message.includes('Video unavailable')) {
            errorMsg = '❌ วิดีโอนี้ไม่สามารถเล่นได้ (อาจถูกลบหรือตั้งเป็นส่วนตัว)';
        } else if (err.message.includes('age-restricted')) {
            errorMsg = '❌ วิดีโอนี้มีการจำกัดอายุ ไม่สามารถเล่นได้';
        } else if (err.message.includes('private')) {
            errorMsg = '❌ วิดีโอนี้เป็นส่วนตัว ไม่สามารถเล่นได้';
        }
        
        message.reply(errorMsg);
        if (connection) connection.destroy();
    }
}

// Event: เมื่อบอทพร้อม
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log('🎵 Music Bot is ready!');
    console.log('✅ Using ytdl-core for YouTube playback');
    client.user.setActivity('!help | Music Bot', { type: 2 });
});

// Event: รับข้อความ
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!play')) {
        const url = message.content.split(' ')[1];
        if (!url) {
            message.reply('❌ โปรดระบุ URL ของ YouTube\nตัวอย่าง: `!play https://www.youtube.com/watch?v=xxxxx`');
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