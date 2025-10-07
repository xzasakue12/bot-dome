const config = require('../config');

module.exports = {
    name: 'lyrics',
    description: 'แสดงเนื้อเพลงที่กำลังเล่น',
    async execute(message, args) {
        if (!config.state.currentSong) {
            return message.reply('❌ ไม่มีเพลงที่กำลังเล่นอยู่!');
        }

        const { title } = config.state.currentSong;

        // ฟีเจอร์นี้ต้องใช้ API เช่น Genius API
        // สำหรับตอนนี้แสดงข้อความแจ้ง
        message.reply(
            `🎤 **กำลังค้นหาเนื้อเพลง:** ${title}\n\n` +
            `⚠️ ฟีเจอร์นี้ยังอยู่ในระหว่างการพัฒนา\n` +
            `คุณสามารถค้นหาเนื้อเพลงได้ที่:\n` +
            `• https://genius.com/search?q=${encodeURIComponent(title)}\n` +
            `• https://www.google.com/search?q=${encodeURIComponent(title + ' lyrics')}`
        );
    }
};
