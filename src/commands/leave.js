const config = require('../config');

module.exports = {
    name: 'leave',
    description: 'ออกจากห้องเสียง',
    async execute(message, args) {
        try {
            const voiceChannel = message.member?.voice?.channel;

            if (!voiceChannel) {
                return message.reply('❌ คุณต้องอยู่ในห้องเสียงเพื่อใช้คำสั่งนี้');
            }

            if (!config.state.currentConnection) {
                return message.reply('❌ บอทไม่ได้อยู่ในห้องเสียง!');
            }

            // หยุด player
            if (config.state.currentPlayer) {
                config.state.currentPlayer.stop();
                config.state.currentPlayer = null;
            }

            // ตัดการเชื่อมต่อ
            config.state.currentConnection.destroy();
            config.state.currentConnection = null;

            // ล้างข้อมูล
            config.queue.length = 0;
            config.state.isPlaying = false;
            config.state.isPaused = false;
            config.state.currentSong = null;
            config.state.lastPlayedVideoId = null;

            // ล้าง timeout
            if (config.state.leaveTimeout) {
                clearTimeout(config.state.leaveTimeout);
                config.state.leaveTimeout = null;
            }

            message.reply('👋 ออกจากห้องเสียงแล้ว!');
        } catch (error) {
            console.error('❌ Error while leaving voice channel:', error);
            return message.reply('❌ เกิดข้อผิดพลาดในการออกจากห้องเสียง');
        }
    }
};
