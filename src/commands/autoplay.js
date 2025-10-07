const config = require('../config');

module.exports = {
    name: 'autoplay',
    description: 'เปิด/ปิดระบบ autoplay',
    async execute(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน!');
        }

        const mode = args[0]?.toLowerCase();

        if (!mode || !['on', 'off'].includes(mode)) {
            const currentStatus = config.settings.autoplayEnabled ? 'เปิด 🟢' : 'ปิด 🔴';
            return message.reply(
                `❌ กรุณาระบุ: \`on\` หรือ \`off\`\n` +
                `🎲 สถานะปัจจุบัน: **${currentStatus}**`
            );
        }

        if (mode === 'on') {
            config.settings.autoplayEnabled = true;
            message.reply('🎲 เปิดระบบ Autoplay แล้ว! บอทจะเล่นเพลงต่ออัตโนมัติเมื่อคิวหมด');
        } else {
            config.settings.autoplayEnabled = false;
            message.reply('⏹️ ปิดระบบ Autoplay แล้ว! บอทจะหยุดเมื่อเพลงในคิวหมด');
        }
    }
};
