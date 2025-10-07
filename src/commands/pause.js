const config = require('../config');

module.exports = {
    name: 'pause',
    description: 'หยุดเพลงชั่วคราว',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        if (!config.state.currentPlayer) {
            return message.reply('❌ ไม่มีเพลงที่กำลังเล่นอยู่!');
        }

        if (config.state.isPaused) {
            return message.reply('⏸️ เพลงหยุดอยู่แล้ว!');
        }

        config.state.currentPlayer.pause();
        config.state.isPaused = true;
        message.reply('⏸️ หยุดเพลงชั่วคราวแล้ว');
    }
};
