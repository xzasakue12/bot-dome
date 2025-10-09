const config = require('../config');
const { checkAndLeaveIfEmpty } = require('../services/voiceChannelManager');

/**
 * จัดการเหตุการณ์เมื่อมีคนออกจากห้องเสียง
 */
function handleVoiceStateUpdate(oldState, newState) {
    // ตรวจสอบว่ามีคนออกจากห้องเสียงที่บอทอยู่หรือไม่
    if (oldState.channelId && oldState.channelId === newState.guild.members.me?.voice?.channelId) {
        // มีคนออกจากห้องที่บอทอยู่
        const voiceChannel = oldState.channel;
        
        if (voiceChannel) {
            // ตรวจสอบว่ายังมีคนอยู่หรือไม่
            setTimeout(() => {
                checkAndLeaveIfEmpty(voiceChannel);
            }, 1000); // รอ 1 วินาที เพื่อให้แน่ใจว่า state อัปเดตแล้ว
        }
    }
}

module.exports = {
    handleVoiceStateUpdate
};
