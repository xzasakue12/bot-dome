const fs = require('fs');
const path = require('path');
const play = require('play-dl');

let soundcloudTokenPromise = null;

function readCandidate(paths) {
    for (const candidate of paths) {
        try {
            if (fs.existsSync(candidate)) {
                const value = fs.readFileSync(candidate, 'utf8').trim();
                if (value) {
                    return value;
                }
            }
        } catch (error) {
            console.warn('⚠️ Failed to read SoundCloud client id:', error.message || error);
        }
    }
    return null;
}

async function refreshSpotifyTokenIfNeeded() {
    if (typeof play.is_expired !== 'function' || typeof play.refreshToken !== 'function') {
        return;
    }

    try {
        if (play.is_expired()) {
            await play.refreshToken();
        }
    } catch (error) {
        if (error && typeof error.message === 'string' && error.message.includes('expiry')) {
            return;
        }
        console.warn('⚠️ play-dl token refresh failed:', error.message || error);
    }
}

async function ensureSoundcloudToken() {
    if (typeof play.setToken !== 'function') {
        return;
    }

    if (soundcloudTokenPromise) {
        return soundcloudTokenPromise;
    }

    soundcloudTokenPromise = (async () => {
        let clientId = process.env.SOUNDCLOUD_CLIENT_ID || process.env.SOUNDCLOUD_ID || '';
        clientId = clientId.trim();

        if (!clientId) {
            clientId = readCandidate([
                '/etc/secrets/SOUNDCLOUD_CLIENT_ID',
                path.resolve(__dirname, '..', '..', 'SOUNDCLOUD_CLIENT_ID'),
                path.resolve(__dirname, 'SOUNDCLOUD_CLIENT_ID')
            ]) || '';
        }

        if (!clientId) {
            try {
                clientId = await play.getFreeClientID();
            } catch (error) {
                console.warn('⚠️ Failed to fetch SoundCloud client id:', error.message || error);
            }
        }

        if (!clientId) {
            throw new Error('Missing SoundCloud client id for play-dl');
        }

        try {
            await play.setToken({ soundcloud: { client_id: clientId } });
        } catch (error) {
            throw new Error(error && error.message ? error.message : error);
        }
    })().catch((error) => {
        soundcloudTokenPromise = null;
        throw error;
    });

    return soundcloudTokenPromise;
}

module.exports = {
    refreshSpotifyTokenIfNeeded,
    ensureSoundcloudToken
};
