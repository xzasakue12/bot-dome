const config = require('../config');

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
        
        config.state.skipRequested = true;
        if (config.state.currentSong) {
            config.state.currentSong.skipRequested = true;
        }
        
        // หยุดเพลงปัจจุบัน ระบบจะเล่นเพลงถัดไปอัตโนมัติ
        config.state.currentPlayer.stop();
    }
};
