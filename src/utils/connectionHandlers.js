// Utility function to setup connection handlers
const { VoiceConnectionStatus, entersState } = require('@discordjs/voice');

function setupConnectionHandlers(connection, guildId, voiceChannel) {
    connection.removeAllListeners('stateChange');
    connection.removeAllListeners('error');

    connection.on('stateChange', async (oldState, newState) => {
        console.log(`🔄 [${guildId}] ${oldState.status} → ${newState.status}`);

        if (newState.status === VoiceConnectionStatus.Ready) {
            console.log(`✅ [${guildId}] Connection stable`);
        }

        if (newState.status === VoiceConnectionStatus.Disconnected) {
            console.log(`⚠️ [${guildId}] Disconnected, attempting recovery...`);
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                ]);
                await entersState(connection, VoiceConnectionStatus.Ready, 10000);
                console.log(`✅ [${guildId}] Reconnected successfully`);
            } catch (error) {
                console.error(`❌ [${guildId}] Failed to reconnect:`, error.message);
                connection.destroy();
            }
        }
    });

    connection.on('error', (error) => {
        console.error(`❌ [${guildId}] Voice error:`, error.message);
    });
}

module.exports = setupConnectionHandlers;