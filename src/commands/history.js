const dataStore = require('../services/dataStore');

function formatRecent(history) {
    if (!history.length) {
        return '📜 ยังไม่มีประวัติการเล่นเพลง';
    }

    return history.slice(0, 5).map((entry, index) => {
        const playedAt = new Date(entry.playedAt).toLocaleString();
        return `${index + 1}. ${entry.title} — ขอโดย ${entry.requestedBy} (${playedAt})`;
    }).join('\n');
}

function formatTopTracks(tracks) {
    if (!tracks.length) {
        return '🎶 ยังไม่มีเพลงยอดนิยม';
    }

    return tracks.map((track, index) => `${index + 1}. ${track.title} — ${track.playCount} ครั้ง`).join('\n');
}

function formatTopRequesters(users) {
    if (!users.length) {
        return '🙋 ยังไม่มีสถิติผู้ขอเพลง';
    }

    return users.map((user, index) => `${index + 1}. ${user.tag} — ${user.playCount} เพลง`).join('\n');
}

module.exports = {
    name: 'history',
    description: 'ดูประวัติและสถิติการเล่นเพลง',

    execute(message, args) {
        if (!message.guild) {
            return message.reply('❌ คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น');
        }

        const guildId = message.guild.id;
        const analytics = dataStore.getGuildAnalytics(guildId);
        const subcommand = (args.shift() || 'recent').toLowerCase();

        if (subcommand === 'recent') {
            return message.reply(`📜 **เพลงล่าสุด**\n${formatRecent(analytics.history)}`);
        }

        if (subcommand === 'top' || subcommand === 'tracks') {
            return message.reply(`🏆 **เพลงที่ถูกเล่นมากที่สุด**\n${formatTopTracks(analytics.topTracks)}`);
        }

        if (subcommand === 'users' || subcommand === 'requesters') {
            return message.reply(`🙋 **ผู้ที่ขอเพลงบ่อยที่สุด**\n${formatTopRequesters(analytics.topRequesters)}`);
        }

        return message.reply('❓ ใช้ `!history` (recent), `!history top`, หรือ `!history users`');
    }
};
