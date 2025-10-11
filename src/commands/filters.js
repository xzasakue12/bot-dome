const { listPresets, setPreset, setCustomFilter, getFilterForGuild } = require('../utils/audioFilters');

module.exports = {
    name: 'filters',
    description: 'ตั้งค่าเอฟเฟกต์เสียงของบอท',

    async execute(message, args) {
        if (!message.guild) {
            return message.reply('❌ คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น');
        }

        const guildId = message.guild.id;
        const subcommand = (args.shift() || 'list').toLowerCase();

        if (subcommand === 'list') {
            const { preset, filterString } = getFilterForGuild(guildId);
            const presetList = listPresets().filter((name) => name !== 'custom').join(', ');
            const lines = [
                `🎚️ ตัวกรองเสียงปัจจุบัน: **${preset}**`,
                preset === 'custom' && filterString ? `🧪 Custom: ${filterString}` : null,
                `🔀 Presets ที่มี: ${presetList}`,
                '📝 ใช้ `!filters set <preset>` หรือ `!filters custom <ffmpeg filter>`'
            ].filter(Boolean);

            return message.reply(lines.join('\n'));
        }

        if (subcommand === 'set') {
            if (!args.length) {
                return message.reply('❌ กรุณาระบุ preset ที่ต้องการ เช่น `!filters set bassboost`');
            }

            const presetName = args[0].toLowerCase();

            try {
                setPreset(guildId, presetName);
                return message.reply(`✅ ตั้งค่าเสียงเป็น **${presetName}** แล้ว เพลงใหม่ที่จะเล่นจะใช้เอฟเฟกต์นี้`);
            } catch (error) {
                return message.reply('❌ preset ไม่ถูกต้อง ใช้ `!filters list` เพื่อดูรายการทั้งหมด');
            }
        }

        if (subcommand === 'custom') {
            if (!args.length) {
                return message.reply('❌ กรุณาระบุค่า ffmpeg filter เช่น `!filters custom bass=g=5`');
            }

            const customFilter = args.join(' ');
            setCustomFilter(guildId, customFilter);
            return message.reply('🧪 ตั้งค่า custom filter เรียบร้อยแล้ว เพลงใหม่จะใช้ filter นี้');
        }

        if (subcommand === 'reset') {
            setPreset(guildId, 'flat');
            return message.reply('🔄 รีเซ็ตตัวกรองเสียงกลับสู่ค่าเริ่มต้นแล้ว');
        }

        return message.reply('❓ ใช้ `!filters list`, `!filters set <preset>`, `!filters custom <filter>`, หรือ `!filters reset`');
    }
};
