const config = require('../config');

module.exports = {
    name: 'clear',
    description: 'ล้างคิวทั้งหมด',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        if (config.queue.length === 0) {
            return message.reply('❌ ไม่มีเพลงในคิว!');
        }

        const clearedCount = config.queue.length;
        config.queue.length = 0;
        
        message.reply(`🗑️ ล้างคิวแล้ว ${clearedCount} เพลง!`);
    }
};
