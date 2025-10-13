const fs = require('fs');
const path = require('path');

/**
 * หา path ของ yt-dlp
 */
function getYtDlpPath() {
    // สำหรับการรันบน Windows โดยตรง (ไม่ต้องแก้)
    if (process.platform === 'win32') {
        return path.resolve(__dirname, '..', '..', 'yt-dlp.exe');
    } else {
        // [FIX] สำหรับการรันใน Docker (Linux)
        // ชี้ไปที่ path ที่เราติดตั้ง yt-dlp ไว้ด้วย wget ใน Dockerfile
        return '/usr/local/bin/yt-dlp';
    }
}

/**
 * ตรวจสอบว่ามีคนในห้องเสียงหรือไม่ (ไม่นับบอท)
 */
function checkVoiceChannelEmpty(voiceChannel) {
    if (!voiceChannel) return true;
    
    const humanMembers = voiceChannel.members.filter(member => !member.user.bot);
    return humanMembers.size === 0;
}

/**
 * ตัด string ให้สั้นลง
 */
function truncateString(str, maxLength = 100) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

/**
 * Format เวลา (วินาที) เป็น mm:ss
 */
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

let cachedYoutubeApiKey;

function readSecretFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const value = fs.readFileSync(filePath, 'utf8').trim();
            if (value) {
                return value;
            }
        }
    } catch (error) {
        console.error(`❌ Failed to read secret from ${filePath}:`, error);
    }
    return null;
}

function getYoutubeApiKey() {
    if (cachedYoutubeApiKey !== undefined) {
        return cachedYoutubeApiKey;
    }

    const envValue = process.env.YOUTUBE_API_KEY;
    if (envValue && envValue.trim()) {
        cachedYoutubeApiKey = envValue.trim();
        return cachedYoutubeApiKey;
    }

    const candidates = [
        '/etc/secrets/YOUTUBE_API_KEY',
        path.resolve(__dirname, '..', '..', 'YOUTUBE_API_KEY'),
        path.resolve(__dirname, 'YOUTUBE_API_KEY')
    ];

    for (const candidate of candidates) {
        const value = readSecretFile(candidate);
        if (value) {
            cachedYoutubeApiKey = value;
            return cachedYoutubeApiKey;
        }
    }

    cachedYoutubeApiKey = null;
    return cachedYoutubeApiKey;
}

module.exports = {
    getYtDlpPath,
    checkVoiceChannelEmpty,
    truncateString,
    formatDuration,
    getYoutubeApiKey
};