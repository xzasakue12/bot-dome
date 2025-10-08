const { spawn } = require('child_process');
const config = require('../config');
const { getYtDlpPath } = require('../utils/helpers');

/**
 * ดึง Video ID จาก YouTube URL
 */
function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        }
        if (urlObj.hostname.includes('youtu.be')) {
            return urlObj.pathname.slice(1);
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * ดึงข้อมูลวิดีโอด้วย yt-dlp
 */
async function getVideoTitle(url) {
    return new Promise((resolve) => {
        try {
            const ytDlpPath = getYtDlpPath();
            const process = spawn(ytDlpPath, [
                '--get-title',
                '--no-warnings',
                '--no-playlist',
                url
            ]);

            let title = '';
            process.stdout.on('data', (data) => {
                title += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0 && title.trim()) {
                    resolve(title.trim());
                } else {
                    resolve(null);
                }
            });

            process.on('error', () => {
                resolve(null);
            });
        } catch (e) {
            resolve(null);
        }
    });
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

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('คุณต้องอยู่ในห้องเสียงก่อน');
        }

        // เก็บช่องข้อความที่ใช้งาน
        config.state.lastTextChannel = message.channel;

        // ดึงชื่อเพลง
        message.reply('⏳ กำลังดึงข้อมูลเพลง...');
        
        let songTitle = cleanUrl;
        try {
            const title = await getVideoTitle(cleanUrl);
            if (title) {
                songTitle = title;
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
        
        message.channel.send(`✅ เพิ่มเพลงเข้าคิวแล้ว: **${songTitle}**`);
        
        // Import playNext dynamically to avoid circular dependency
        if (!config.state.isPlaying) {
            const { playNext } = require('../handlers/player');
            playNext(voiceChannel.guild.id);
        }
    }
};