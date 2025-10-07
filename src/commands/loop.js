const config = require('../config');

module.exports = {
    name: 'loop',
    description: 'ตั้งค่าโหมดลูป (song/queue/off)',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        const mode = args[0]?.toLowerCase();

        if (!mode || !['song', 'queue', 'off'].includes(mode)) {
            return message.reply('❌ กรุณาระบุโหมด: `song`, `queue` หรือ `off`\n' +
                               `🔄 โหมดปัจจุบัน: **${config.loop.mode}**`);
        }

        if (mode === 'song') {
            config.loop.mode = 'song';
            config.loop.originalQueue = [];
            message.reply('🔂 เปิดโหมดลูปเพลงเดียว');
        } else if (mode === 'queue') {
            config.loop.mode = 'queue';
            // บันทึกคิวปัจจุบัน
            config.loop.originalQueue = config.queue.map(song => ({...song}));
            message.reply('🔁 เปิดโหมดลูปคิว');
        } else {
            config.loop.mode = 'off';
            config.loop.originalQueue = [];
            message.reply('➡️ ปิดโหมดลูป');
        }
    }
};
