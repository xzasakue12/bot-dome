const config = require('../config');

module.exports = {
    name: 'nowplaying',
    description: 'แสดงเพลงที่กำลังเล่นอยู่',
    async execute(message, args) {
        if (!config.state.isPlaying || !config.state.currentSong) {
            return message.reply('❌ ไม่มีเพลงที่กำลังเล่นอยู่!');
        }

        const { title, cleanUrl } = config.state.currentSong;
        const loopStatus = config.loop.mode === 'song' ? ' 🔂' : 
                          config.loop.mode === 'queue' ? ' 🔁' : '';
        
        message.reply(`🎵 กำลังเล่น${loopStatus}: **${title || cleanUrl}**`);
    }
};
