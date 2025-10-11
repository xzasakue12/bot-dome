const config = require('../config');

module.exports = {
    name: 'skipto',
    description: 'ข้ามไปเพลงที่ระบุในคิว',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        if (!config.state.isPlaying) {
            return message.reply('❌ ไม่มีเพลงที่กำลังเล่นอยู่!');
        }

        if (config.queue.length === 0) {
            return message.reply('❌ ไม่มีเพลงในคิว!');
        }

        const position = parseInt(args[0]);

        if (isNaN(position) || position < 1 || position > config.queue.length) {
            return message.reply(`❌ กรุณาระบุตำแหน่งที่ถูกต้อง (1-${config.queue.length})`);
        }

        // ลบเพลงก่อนหน้าตำแหน่งที่ต้องการ
        const skippedCount = position - 1;
        if (skippedCount > 0) {
            config.queue.splice(0, skippedCount);
        }

        // ข้ามเพลงปัจจุบัน
        config.state.skipRequested = true;
        if (config.state.currentSong) {
            config.state.currentSong.skipRequested = true;
        }
        if (config.state.currentPlayer) {
            config.state.currentPlayer.stop();
        }

        message.reply(`⏭️ ข้ามไปที่เพลงที่ ${position}!`);
    }
};
