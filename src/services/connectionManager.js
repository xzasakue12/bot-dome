const { VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const connectionState = new Map();
const MAX_RETRIES = 3;

function setupConnectionHandlers(connection, guildId, voiceChannel) {
    connection.removeAllListeners('stateChange');
    connection.removeAllListeners('error');

    if (!connectionState.has(guildId)) {
        connectionState.set(guildId, { retries: 0, lastError: null });
    }

    const state = connectionState.get(guildId);

    connection.on('stateChange', async (oldState, newState) => {
        console.log(`🔄 [${guildId}] ${oldState.status} → ${newState.status}`);

        if (newState.status === VoiceConnectionStatus.Ready) {
            state.retries = 0;
            console.log(`✅ [${guildId}] Connection stable`);
        }

        if (newState.status === VoiceConnectionStatus.Disconnected) {
            console.log(`⚠️ [${guildId}] Disconnected, attempting recovery...`);

            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);

                await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
                console.log(`✅ [${guildId}] Reconnected successfully`);
                state.retries = 0;

            } catch (error) {
                console.error(`❌ [${guildId}] Failed to reconnect:`, error.message);

                if (state.retries >= MAX_RETRIES) {
                    console.error(`❌ [${guildId}] Max retries reached, destroying connection`);
                    if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                        connection.destroy();
                    }
                } else {
                    console.log(`🔄 [${guildId}] Will retry... (${state.retries}/${MAX_RETRIES})`);
                }
            }
        }
    });

    connection.on('error', async (error) => {
        console.error(`❌ [${guildId}] Voice error:`, error.message);
        state.lastError = error;

        const isRecoverable = 
            error.message.includes('socket closed') ||
            error.message.includes('IP discovery') ||
            error.message.includes('ECONNRESET') ||
            error.message.includes('ETIMEDOUT');

        if (isRecoverable && state.retries < MAX_RETRIES) {
            state.retries++;
            console.log(`🔄 [${guildId}] Retry ${state.retries}/${MAX_RETRIES}`);
            return;
        }

        console.error(`❌ [${guildId}] Connection failed (${state.retries} retries)`);
    });
}

module.exports = { setupConnectionHandlers };