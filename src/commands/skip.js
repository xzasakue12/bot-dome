const config = require('../config');
const { playNext } = require('../handlers/player');

module.exports = {
    name: 'skip',
    description: 'ข้ามเพลงปัจจุบัน',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        if (!config.state.currentPlayer) {
            return message.reply('❌ ไม่มีเพลงที่กำลังเล่นอยู่!');
        }

        message.reply('⏭️ กำลังข้ามเพลง...');
        
        // หยุดเพลงปัจจุบัน ระบบจะเล่นเพลงถัดไปอัตโนมัติ
        config.state.currentPlayer.stop();
    }
};
