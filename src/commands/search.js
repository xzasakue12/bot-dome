const config = require('../config');
const { searchYouTube } = require('../utils/youtube');

module.exports = {
    name: 'search',
    description: 'ค้นหาเพลงจาก YouTube',
    
    async execute(message, args) {
        const query = message.content.slice(8).trim();
        
        if (!query) {
            return message.reply('กรุณาใส่คำค้นหา\nตัวอย่าง: `!search naruto opening`');
        }

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('คุณต้องอยู่ในห้องเสียงก่อน');
        }

        message.reply(`🔍 กำลังค้นหา: **${query}**`);

        try {
            const searchResult = await searchYouTube(query, 5);

            if (searchResult.length === 0) {
                return message.reply('❌ ไม่พบผลลัพธ์');
            }

            // แสดงผลลัพธ์
            let resultMessage = '🔎 **ผลการค้นหา:**\n\n';
            searchResult.forEach((video, index) => {
                const duration = video.durationRaw || 'N/A';
                resultMessage += `**${index + 1}.** ${video.title}\n⏱️ ${duration}\n\n`;
            });
            resultMessage += 'กำลังเล่นเพลงแรก... ใช้ `!search` อีกครั้งเพื่อเลือกเพลงอื่น';

            await message.reply(resultMessage);

            // เล่นเพลงแรก
            const firstVideo = searchResult[0];
            const cleanUrl = firstVideo.url;
            const songTitle = firstVideo.title;

            config.state.lastTextChannel = message.channel;
            config.queue.push({ 
                cleanUrl, 
                voiceChannel, 
                message, 
                textChannel: message.channel, 
                title: songTitle,
                sourceType: 'youtube',
                streamData: null,
                durationMs: null,
                videoId: firstVideo.videoId || null
            });

            if (!config.state.isPlaying) {
                const { playNext } = require('../handlers/player');
                playNext(voiceChannel.guild.id);
            } else {
                message.reply(`✅ เพิ่มเข้าคิว: **${songTitle}**`);
            }

        } catch (error) {
            console.error('Search error:', error);
            message.reply('❌ เกิดข้อผิดพลาดในการค้นหา');
        }
    }
};
