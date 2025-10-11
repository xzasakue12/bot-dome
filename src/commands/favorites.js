const config = require('../config');
const dataStore = require('../services/dataStore');

function formatFavoritesList(favorites) {
    if (!favorites.length) {
        return '⭐ คุณยังไม่มีเพลงโปรด ใช้ `!favorites add` เพื่อบันทึกเพลงปัจจุบัน';
    }

    const lines = favorites.map((fav, index) => {
        const duration = fav.durationMs ? ` (${Math.round(fav.durationMs / 1000)}s)` : '';
        return `${index + 1}. ${fav.title}${duration}`;
    });

    return ['⭐ **เพลงโปรดของคุณ**', ...lines].join('\n');
}

function buildTrackFromFavorite(favorite, context) {
    const {
        voiceChannel,
        message,
        textChannel,
        guildId,
        requestedBy,
        requestedByTag
    } = context;

    return {
        cleanUrl: favorite.url,
        voiceChannel,
        guildId,
        requestedBy,
        requestedByTag,
        message,
        textChannel,
        title: favorite.title || favorite.url,
        sourceType: favorite.sourceType || 'youtube',
        streamData: null,
        durationMs: favorite.durationMs || null,
        videoId: favorite.videoId || null
    };
}

module.exports = {
    name: 'favorites',
    description: 'จัดการเพลงโปรดของคุณ',

    async execute(message, args) {
        const subcommand = (args.shift() || 'list').toLowerCase();
        const userId = message.author.id;
        const favorites = dataStore.getFavorites(userId);

        if (subcommand === 'list') {
            return message.reply(formatFavoritesList(favorites));
        }

        if (subcommand === 'add') {
            const urlArg = args[0];
            let track = null;

            if (urlArg) {
                const guessedType = urlArg.includes('soundcloud') ? 'soundcloud' : 'youtube';
                track = {
                    title: args.slice(1).join(' ') || urlArg,
                    cleanUrl: urlArg,
                    sourceType: guessedType,
                    videoId: null,
                    durationMs: null
                };
            } else if (config.state.currentSong && config.state.currentSong.cleanUrl) {
                track = config.state.currentSong;
            } else if (config.state.lastCompletedSong?.track && config.state.lastCompletedSong.track.cleanUrl) {
                track = config.state.lastCompletedSong.track;
            }

            if (!track) {
                return message.reply('❌ ไม่พบเพลงที่จะบันทึก คุณสามารถใส่ลิงก์หลังคำสั่ง `!favorites add <url>`');
            }

            dataStore.addFavorite(userId, {
                title: track.title || track.cleanUrl || track.url,
                url: track.cleanUrl || track.url,
                sourceType: track.sourceType || 'youtube',
                videoId: track.videoId || null,
                durationMs: track.durationMs || null
            });

            return message.reply(`✅ บันทึกเพลงโปรด: **${track.title || track.cleanUrl}**`);
        }

        if (subcommand === 'remove') {
            if (!args.length) {
                return message.reply('❌ กรุณาระบุหมายเลขเพลงโปรดที่ต้องการลบ เช่น `!favorites remove 2`');
            }

            const index = parseInt(args[0], 10) - 1;
            if (Number.isNaN(index)) {
                return message.reply('❌ หมายเลขไม่ถูกต้อง');
            }

            const removed = dataStore.removeFavorite(userId, index);
            if (!removed) {
                return message.reply('❌ ไม่พบเพลงโปรดที่ตำแหน่งนี้');
            }

            return message.reply('🗑️ ลบเพลงโปรดเรียบร้อยแล้ว');
        }

        if (subcommand === 'play' || subcommand === 'queue') {
            if (!favorites.length) {
                return message.reply('❌ คุณยังไม่มีเพลงโปรด');
            }

            if (!args.length) {
                return message.reply('❌ กรุณาระบุหมายเลขเพลงโปรดที่จะเล่น เช่น `!favorites play 1`');
            }

            const index = parseInt(args[0], 10) - 1;
            if (Number.isNaN(index) || index < 0 || index >= favorites.length) {
                return message.reply('❌ หมายเลขไม่ถูกต้อง');
            }

            const voiceChannel = message.member.voice.channel;
            if (!voiceChannel) {
                return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน');
            }

            const favorite = favorites[index];
            const guildId = voiceChannel.guild.id;
            const requestedByTag = message.author.tag;

            config.state.lastTextChannel = message.channel;

            const track = buildTrackFromFavorite(favorite, {
                voiceChannel,
                message,
                textChannel: message.channel,
                guildId,
                requestedBy: userId,
                requestedByTag
            });

            config.queue.push(track);

            const { playNext } = require('../handlers/player');
            if (!config.state.isPlaying) {
                playNext(guildId);
                return message.reply(`🎶 เริ่มเล่นเพลงโปรด: **${favorite.title}**`);
            }

            return message.reply(`✅ เพิ่มเพลงโปรดเข้าคิว: **${favorite.title}**`);
        }

        return message.reply('❓ ใช้ `!favorites list`, `!favorites add`, `!favorites remove <ลำดับ>`, หรือ `!favorites play <ลำดับ>`');
    }
};
