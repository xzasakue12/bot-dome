const config = require('../config');

module.exports = {
    name: 'volume',
    description: 'ปรับระดับเสียง (0-100)',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        if (!config.state.currentPlayer) {
            return message.reply('❌ ไม่มีเพลงที่กำลังเล่นอยู่!');
        }

        const volume = parseInt(args[0]);

        if (isNaN(volume) || volume < 0 || volume > 100) {
            return message.reply('❌ กรุณาระบุระดับเสียง 0-100');
        }

        // ปรับระดับเสียง (0-100 -> 0-1)
        const volumeLevel = volume / 100;
        
        try {
            if (config.state.currentPlayer.state.resource?.volume) {
                config.state.currentPlayer.state.resource.volume.setVolume(volumeLevel);
                message.reply(`🔊 ปรับระดับเสียงเป็น ${volume}%`);
            } else {
                message.reply('❌ ไม่สามารถปรับระดับเสียงได้ในขณะนี้');
            }
        } catch (error) {
            console.error('Volume error:', error);
            message.reply('❌ เกิดข้อผิดพลาดในการปรับระดับเสียง');
        }
    }
};
