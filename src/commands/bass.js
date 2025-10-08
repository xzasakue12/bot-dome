module.exports = {
    name: 'bass',
    description: 'ปรับระดับเสียงเบส',
    execute(message, args) {
        const newBassGain = parseInt(args[0], 10);

        if (isNaN(newBassGain) || newBassGain < 0 || newBassGain > 20) {
            return message.reply('❌ โปรดระบุค่าระดับเบสระหว่าง 0 ถึง 20');
        }

        const config = require('../config');
        config.audioSettings.bassGain = newBassGain;
        message.reply(`✅ ระดับเบสถูกตั้งค่าเป็น: ${newBassGain} dB`);
    }
};