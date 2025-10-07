const config = require('../config');

module.exports = {
    name: 'remove',
    description: 'ลบเพลงออกจากคิว',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        if (config.queue.length === 0) {
            return message.reply('❌ ไม่มีเพลงในคิว!');
        }

        const position = parseInt(args[0]);
        
        if (isNaN(position) || position < 1 || position > config.queue.length) {
            return message.reply(`❌ กรุณาระบุตำแหน่งที่ถูกต้อง (1-${config.queue.length})`);
        }

        const removed = config.queue.splice(position - 1, 1)[0];
        message.reply(`🗑️ ลบเพลง: **${removed.title || removed.cleanUrl}** ออกจากคิวแล้ว!`);
    }
};
