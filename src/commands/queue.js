const config = require('../config');

module.exports = {
    name: 'queue',
    description: 'แสดงรายการเพลงในคิว',
    
    execute(message) {
        if (config.queue.length === 0 && !config.state.currentSong) {
            return message.reply('📭 ไม่มีเพลงในคิว');
        }

        let queueMessage = '📋 **คิวเพลง**\n\n';
        
        if (config.state.currentSong) {
            queueMessage += `🎵 **กำลังเล่น:** ${config.state.currentSong.title}\n\n`;
        }

        if (config.queue.length > 0) {
            queueMessage += '**ถัดไป:**\n';
            config.queue.forEach((song, index) => {
                queueMessage += `${index + 1}. ${song.title || song.cleanUrl}\n`;
            });
            queueMessage += `\n📊 **รวมทั้งหมด:** ${config.queue.length} เพลง`;
        } else {
            queueMessage += '✨ ไม่มีเพลงถัดไป (Autoplay จะเริ่มทำงาน)';
        }

        message.reply(queueMessage);
    }
};
