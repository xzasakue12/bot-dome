const play = require('play-dl');

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

module.exports = {
    refreshSpotifyTokenIfNeeded
};
