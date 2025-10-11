const { spawn } = require('child_process');
const dataStore = require('../services/dataStore');
const config = require('../config');
const { getYtDlpPath } = require('../utils/helpers');

function normalizeName(name) {
    return name.trim().toLowerCase();
}

async function fetchPlaylistItems(url, limit = 25) {
    return new Promise((resolve, reject) => {
        const ytDlpPath = getYtDlpPath();
        const args = [
            '--flat-playlist',
            '--dump-json',
            '--no-warnings',
            '--playlist-end', String(limit),
            url
        ];

        const process = spawn(ytDlpPath, args, { windowsHide: true });
        const items = [];
        let buffer = '';

        process.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const entry = JSON.parse(line);
                    const videoId = entry.id || entry.url || null;
                    const itemUrl = entry.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : url);
                    items.push({
                        title: entry.title || itemUrl,
                        url: itemUrl,
                        videoId,
                        durationMs: entry.duration ? entry.duration * 1000 : null,
                        sourceType: 'youtube'
                    });
                } catch (error) {
                    console.warn('⚠️ Failed to parse playlist entry:', error.message);
                }
            }
        });

        process.stderr.on('data', (data) => {
            console.warn(`[yt-dlp] ${data.toString().trim()}`);
        });

        process.on('close', (code) => {
            if (buffer.trim()) {
                try {
                    const entry = JSON.parse(buffer);
                    const videoId = entry.id || entry.url || null;
                    const itemUrl = entry.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : url);
                    items.push({
                        title: entry.title || itemUrl,
                        url: itemUrl,
                        videoId,
                        durationMs: entry.duration ? entry.duration * 1000 : null,
                        sourceType: 'youtube'
                    });
                } catch (error) {
                    console.warn('⚠️ Failed to parse trailing playlist entry:', error.message);
                }
            }

            if (code === 0) {
                resolve(items);
            } else {
                reject(new Error(`yt-dlp exited with code ${code}`));
            }
        });

        process.on('error', reject);
    });
}

function findPlaylistIndex(playlists, name) {
    const target = normalizeName(name);
    return playlists.findIndex((pl) => pl.id === target);
}

module.exports = {
    name: 'playlists',
    description: 'จัดการเพลย์ลิสต์ส่วนตัวของเซิร์ฟเวอร์',

    async execute(message, args) {
        if (!message.guild) {
            return message.reply('❌ คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น');
        }

        const guildId = message.guild.id;
        const subcommand = (args.shift() || 'list').toLowerCase();
        const playlists = dataStore.getGuildPlaylists(guildId);

        if (subcommand === 'list') {
            if (!playlists.length) {
                return message.reply('📂 ยังไม่มีเพลย์ลิสต์ ใช้ `!playlists add <ชื่อ> <url>` เพื่อเพิ่ม');
            }

            const lines = playlists.map((pl, index) => `${index + 1}. ${pl.name} — ${pl.items.length} เพลง`);
            return message.reply(['📂 **เพลย์ลิสต์ในเซิร์ฟเวอร์นี้**', ...lines].join('\n'));
        }

        if (subcommand === 'add') {
            const name = args.shift();
            const url = args.shift();

            if (!name || !url) {
                return message.reply('❌ ใช้รูปแบบ `!playlists add <ชื่อ> <url>`');
            }

            const id = normalizeName(name);
            if (findPlaylistIndex(playlists, name) !== -1) {
                return message.reply('❌ มีเพลย์ลิสต์ชื่อนี้อยู่แล้ว ใช้ชื่ออื่นหรือ `!playlists sync` เพื่ออัปเดต');
            }

            message.reply(`⏳ กำลังดึงข้อมูลเพลย์ลิสต์ **${name}** ...`);

            try {
                const items = await fetchPlaylistItems(url);
                if (!items.length) {
                    return message.reply('❌ ไม่พบเพลงในเพลย์ลิสต์นี้');
                }

                playlists.push({
                    id,
                    name,
                    url,
                    sourceType: 'youtube',
                    items
                });
                dataStore.setGuildPlaylists(guildId, playlists);

                return message.reply(`✅ เพิ่มเพลย์ลิสต์ **${name}** จำนวน ${items.length} เพลงเรียบร้อยแล้ว`);
            } catch (error) {
                console.error('Playlist add error:', error);
                return message.reply('❌ ไม่สามารถดึงข้อมูลเพลย์ลิสต์ได้ โปรดลองอีกครั้ง');
            }
        }

        if (subcommand === 'remove') {
            const name = args.shift();
            if (!name) {
                return message.reply('❌ ระบุชื่อเพลย์ลิสต์ที่ต้องการลบ เช่น `!playlists remove chill`');
            }

            const index = findPlaylistIndex(playlists, name);
            if (index === -1) {
                return message.reply('❌ ไม่พบเพลย์ลิสต์ชื่อนี้');
            }

            const [removed] = playlists.splice(index, 1);
            dataStore.setGuildPlaylists(guildId, playlists);

            return message.reply(`🗑️ ลบเพลย์ลิสต์ **${removed.name}** แล้ว`);
        }

        if (subcommand === 'sync') {
            const name = args.shift();
            if (!name) {
                return message.reply('❌ ระบุชื่อเพลย์ลิสต์ที่ต้องการ sync เช่น `!playlists sync chill`');
            }

            const index = findPlaylistIndex(playlists, name);
            if (index === -1) {
                return message.reply('❌ ไม่พบเพลย์ลิสต์ชื่อนี้');
            }

            const target = playlists[index];
            message.reply(`⏳ กำลังอัปเดตเพลย์ลิสต์ **${target.name}** ...`);

            try {
                const items = await fetchPlaylistItems(target.url);
                if (!items.length) {
                    return message.reply('❌ เพลย์ลิสต์นี้ไม่มีเพลง หรือไม่สามารถดึงข้อมูลได้');
                }

                playlists[index] = { ...target, items };
                dataStore.setGuildPlaylists(guildId, playlists);

                return message.reply(`✅ อัปเดตเพลย์ลิสต์ **${target.name}** แล้ว (${items.length} เพลง)`);
            } catch (error) {
                console.error('Playlist sync error:', error);
                return message.reply('❌ ไม่สามารถอัปเดตเพลย์ลิสต์ได้');
            }
        }

        if (subcommand === 'play') {
            const name = args.shift();
            if (!name) {
                return message.reply('❌ ระบุชื่อเพลย์ลิสต์ที่จะเล่น เช่น `!playlists play chill`');
            }

            const index = findPlaylistIndex(playlists, name);
            if (index === -1) {
                return message.reply('❌ ไม่พบเพลย์ลิสต์ชื่อนี้');
            }

            const voiceChannel = message.member.voice.channel;
            if (!voiceChannel) {
                return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน');
            }

            const playlist = playlists[index];
            if (!playlist.items.length) {
                return message.reply('❌ เพลย์ลิสต์นี้ไม่มีเพลง โปรด `!playlists sync` ก่อน');
            }

            const queueLimit = Math.min(playlist.items.length, 20);
            const guildIdForQueue = voiceChannel.guild.id;
            const requestedByTag = message.author.tag;
            config.state.lastTextChannel = message.channel;

            for (let i = 0; i < queueLimit; i += 1) {
                const item = playlist.items[i];
                config.queue.push({
                    cleanUrl: item.url,
                    voiceChannel,
                    guildId: guildIdForQueue,
                    requestedBy: message.author.id,
                    requestedByTag,
                    message,
                    textChannel: message.channel,
                    title: item.title || item.url,
                    sourceType: item.sourceType || 'youtube',
                    streamData: null,
                    durationMs: item.durationMs || null,
                    videoId: item.videoId || null
                });
            }

            const { playNext } = require('../handlers/player');
            if (!config.state.isPlaying) {
                playNext(guildIdForQueue);
                return message.reply(`🎶 เริ่มเล่นเพลย์ลิสต์ **${playlist.name}** (${queueLimit} เพลง)`);
            }

            return message.reply(`✅ เพิ่มเพลย์ลิสต์ **${playlist.name}** จำนวน ${queueLimit} เพลงเข้าคิวแล้ว`);
        }

        return message.reply('❓ ใช้ `!playlists list`, `add`, `remove`, `sync`, หรือ `play`');
    }
};
