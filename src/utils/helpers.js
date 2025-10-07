const path = require('path');

/**
 * หา path ของ yt-dlp
 */
function getYtDlpPath() {
    if (process.platform === 'win32') {
        return path.resolve(__dirname, '..', '..', 'yt-dlp.exe');
    } else {
        return path.resolve(__dirname, '..', '..', 'yt-dlp');
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

module.exports = {
    getYtDlpPath,
    checkVoiceChannelEmpty,
    truncateString,
    formatDuration
};
