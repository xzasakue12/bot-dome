// Utility function to check and leave voice channel if empty
function checkAndLeaveIfEmpty(voiceChannel, config) {
    if (!voiceChannel || voiceChannel.members.filter(member => !member.user.bot).size === 0) {
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
            config.state.lastTextChannel.send('👋 Leaving the voice channel as it is empty.').catch(console.error);
        }
        return true;
    }
    return false;
}

module.exports = checkAndLeaveIfEmpty;