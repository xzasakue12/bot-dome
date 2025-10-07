const config = require('../config');

module.exports = {
    name: 'shuffle',
    description: 'สลับลำดับเพลงในคิว',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        if (config.queue.length < 2) {
            return message.reply('❌ ต้องมีเพลงในคิวอย่างน้อย 2 เพลง!');
        }

        // Fisher-Yates shuffle algorithm
        for (let i = config.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [config.queue[i], config.queue[j]] = [config.queue[j], config.queue[i]];
        }
        
        message.reply(`🔀 สลับเพลงในคิวแล้ว ${config.queue.length} เพลง!`);
    }
};
