const config = require('../config');

module.exports = {
    name: 'stop',
    description: 'หยุดเล่นเพลงและออกจากห้องเสียง',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        if (!config.state.currentConnection) {
            return message.reply('❌ บอทไม่ได้อยู่ในห้องเสียง!');
        }

        config.state.skipRequested = true;
        if (config.state.currentSong) {
            config.state.currentSong.skipRequested = true;
        }

        // ล้างคิว
        config.queue.length = 0;
        
        // หยุด player
        if (config.state.currentPlayer) {
            config.state.currentPlayer.stop();
            config.state.currentPlayer = null;
        }
        
        // ตัดการเชื่อมต่อ
        if (config.state.currentConnection) {
            config.state.currentConnection.destroy();
            config.state.currentConnection = null;
        }
        
        config.state.isPlaying = false;
        config.state.lastPlayedVideoId = null;
        
        message.reply('⏹️ หยุดเล่นเพลงและออกจากห้องเสียงแล้ว!');
    }
};
