const playdl = require('play-dl');
const config = require('../config');
const { getVideoInfo } = require('../utils/youtube');

module.exports = {
    name: 'play',
    description: 'เล่นเพลงจาก YouTube URL',
    
    async execute(message, args) {
        const urlMatch = message.content.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\S+/i);
        const url = urlMatch ? urlMatch[0].split('&')[0] : null;

        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            return message.reply('กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง');
        }

        let videoId;
        let cleanUrl;
        try {
            videoId = playdl.extractID(url);
            cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
        } catch (e) {
            console.log('Error extracting videoId:', e);
            return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
        }

        if (!videoId) {
            return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
        }

        const validateResult = playdl.yt_validate(cleanUrl);
        if (validateResult !== 'video') {
            return message.reply('กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง (ต้องเป็นลิงก์วิดีโอเท่านั้น)');
        }

        let info;
        try {
            info = await playdl.video_basic_info(cleanUrl);
            if (!info || !info.video_details || !info.video_details.id) {
                return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
            }
        } catch (e) {
            console.log('video_basic_info error:', e);
            return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
        }

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('คุณต้องอยู่ในห้องเสียงก่อน');
        }

        // เก็บช่องข้อความที่ใช้งาน
        config.state.lastTextChannel = message.channel;

        // ดึงข้อมูลเพลง
        let songTitle = cleanUrl;
        try {
            const videoInfo = await playdl.video_info(cleanUrl);
            if (videoInfo && videoInfo.video_details) {
                songTitle = videoInfo.video_details.title;
            }
        } catch (e) {
            console.log('Cannot get video title:', e);
        }

        config.queue.push({ 
            cleanUrl, 
            voiceChannel, 
            message, 
            textChannel: message.channel, 
            title: songTitle 
        });
        
        message.reply(`✅ เพิ่มเพลงเข้าคิวแล้ว: **${songTitle}**`);
        
        // Import playNext dynamically to avoid circular dependency
        if (!config.state.isPlaying) {
            const { playNext } = require('../handlers/player');
            playNext(voiceChannel.guild.id);
        }
    }
};
