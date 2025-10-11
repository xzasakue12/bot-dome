const config = require('../config');
const dataStore = require('../services/dataStore');

module.exports = {
    name: 'stats',
    description: 'แสดงสถิติบอท',
    async execute(message, args) {
        const client = message.client;
        
        // คำนวณ uptime
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        let uptimeString = '';
        if (days > 0) uptimeString += `${days} วัน `;
        if (hours > 0) uptimeString += `${hours} ชั่วโมง `;
        if (minutes > 0) uptimeString += `${minutes} นาที `;
        uptimeString += `${seconds} วินาที`;
        
        // คำนวณ memory usage
        const memoryUsage = process.memoryUsage();
        const memoryMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
        const memoryTotal = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
        
        // นับจำนวนเซิร์ฟเวอร์และผู้ใช้
        const servers = client.guilds.cache.size;
        const users = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        
        // สถานะการเล่น
        const playingStatus = config.state.isPlaying ? '🟢 กำลังเล่น' : '🔴 หยุด';
        const queueSize = config.queue.length;
        const loopMode = config.loop.mode === 'song' ? '🔂 เพลงเดียว' : 
                        config.loop.mode === 'queue' ? '🔁 ทั้งคิว' : '➡️ ปิด';
        const autoplayStatus = config.settings.autoplayEnabled ? '🟢 เปิด' : '🔴 ปิด';
        
        const analytics = message.guild ? dataStore.getGuildAnalytics(message.guild.id) : { history: [], topTracks: [], topRequesters: [] };
        const topTrack = analytics.topTracks && analytics.topTracks.length ? `🎧 เพลงฮิต: ${analytics.topTracks[0].title} (${analytics.topTracks[0].playCount} ครั้ง)` : '';
        const topRequester = analytics.topRequesters && analytics.topRequesters.length ? `🙋 ผู้ขอบ่อยสุด: ${analytics.topRequesters[0].tag} (${analytics.topRequesters[0].playCount} เพลง)` : '';

        const commandCount = message.client?.commands?.size || 0;

        const statsMessage = `
📊 **สถิติบอท - ${client.user.username}**

**ระบบ:**
⏱️ Uptime: ${uptimeString}
💾 Memory: ${memoryMB} MB / ${memoryTotal} MB
🖥️ Node.js: ${process.version}
📡 Ping: ${client.ws.ping}ms

**Discord:**
🌐 เซิร์ฟเวอร์: ${servers}
👥 ผู้ใช้: ${users}

**เพลง:**
${playingStatus}
📋 เพลงในคิว: ${queueSize}
🔁 โหมดลูป: ${loopMode}
🎲 Autoplay: ${autoplayStatus}
${config.state.currentSong ? `🎵 กำลังเล่น: **${config.state.currentSong.title}**` : ''}
 ${topTrack}
 ${topRequester}

**คำสั่ง:**
📝 คำสั่งทั้งหมด: ${commandCount} คำสั่ง
⚡ เวอร์ชัน: v3.0.0
        `.trim();
        
        message.reply(statsMessage);
    }
};
