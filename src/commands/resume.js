const config = require('../config');

module.exports = {
    name: 'resume',
    description: 'เล่นเพลงต่อ',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        if (!config.state.currentPlayer) {
            return message.reply('❌ ไม่มีเพลงที่กำลังเล่นอยู่!');
        }

        if (!config.state.isPaused) {
            return message.reply('▶️ เพลงกำลังเล่นอยู่แล้ว!');
        }

        config.state.currentPlayer.unpause();
        config.state.isPaused = false;
        message.reply('▶️ เล่นเพลงต่อแล้ว');
    }
};
