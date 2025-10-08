const ytdl = require('ytdl-core');
const config = require('../config');
const { getVideoInfo } = require('../utils/youtube');

/**
 * ดึง Video ID จาก YouTube URL
 */
function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        
        // youtube.com/watch?v=xxxxx
        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        }
        
        // youtu.be/xxxxx
        if (urlObj.hostname.includes('youtu.be')) {
            return urlObj.pathname.slice(1);
        }
        
        return null;
    } catch (e) {
        return null;
    }
}

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
            videoId = extractVideoId(url);
            if (!videoId) {
                return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
            }
            cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
        } catch (e) {
            console.log('Error extracting videoId:', e);
            return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
        }

        // ตรวจสอบด้วย ytdl-core
        if (!ytdl.validateURL(cleanUrl)) {
            return message.reply('กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง (ต้องเป็นลิงก์วิดีโอเท่านั้น)');
        }

        // ตรวจสอบว่าสามารถดึงข้อมูลวิดีโอได้หรือไม่
        let info;
        try {
            info = await ytdl.getBasicInfo(cleanUrl);
            if (!info || !info.videoDetails || !info.videoDetails.videoId) {
                return message.reply('ไม่สามารถอ่านลิงก์ YouTube นี้ได้ กรุณาตรวจสอบอีกครั้ง');
            }
        } catch (e) {
            console.log('getBasicInfo error:', e);
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
            const videoInfo = await getVideoInfo(cleanUrl);
            if (videoInfo && videoInfo.title) {
                songTitle = videoInfo.title;
            } else if (info && info.videoDetails && info.videoDetails.title) {
                songTitle = info.videoDetails.title;
            }
        } catch (e) {
            console.log('Cannot get video title:', e);
            // ใช้ชื่อจาก basic info ที่ได้มาแล้ว
            if (info && info.videoDetails && info.videoDetails.title) {
                songTitle = info.videoDetails.title;
            }
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