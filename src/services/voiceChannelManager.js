const config = require('../config');
const { checkVoiceChannelEmpty } = require('../utils/helpers');

/**
 * ฟังก์ชันออกจากห้องเสียงถ้าไม่มีคน
 */
function checkAndLeaveIfEmpty(voiceChannel) {
    if (checkVoiceChannelEmpty(voiceChannel)) {
        console.log('👤 No humans in voice channel, leaving...');

        if (global.nextTimeout) {
            clearTimeout(global.nextTimeout);
            global.nextTimeout = null;
        }
        if (config.state.leaveTimeout) {
            clearTimeout(config.state.leaveTimeout);
            config.state.leaveTimeout = null;
        }

        if (config.state.currentConnection) {
            config.state.currentConnection.destroy();
            config.state.currentConnection = null;
        }
        if (config.state.currentPlayer) {
            config.state.currentPlayer.stop();
            config.state.currentPlayer = null;
        }

        config.queue.length = 0;
        config.state.isPlaying = false;
        config.state.lastPlayedVideoId = null;

        if (config.state.lastTextChannel) {
            config.state.lastTextChannel.send('👋 ไม่มีคนในห้องเสียงแล้ว บอทออกจากห้องแล้วนะ')
                .catch(e => console.error('Send message error:', e));
        }
        return true;
    }
    return false;
}

module.exports = { checkAndLeaveIfEmpty };