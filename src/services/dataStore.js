const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'botData.json');

let data = {
    favorites: {}, // userId -> [{ title, url, sourceType, videoId, durationMs }]
    playlists: {}, // guildId -> [{ id, title, sourceType, url, items: [] }]
    filters: {}, // guildId -> { preset, custom }
    analytics: {
        playbackHistory: {}, // guildId -> [{ title, url, requestedBy, playedAt, durationMs }]
        topTracks: {}, // guildId -> { trackKey -> { title, url, playCount } }
        topRequesters: {} // guildId -> { userId -> { tag, playCount } }
    }
};

let writeTimer = null;

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadData() {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) {
        saveData();
        return;
    }

    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            data = { ...data, ...parsed };
        }
    } catch (error) {
        console.error('❌ Failed to load data store:', error);
    }
}

function saveData() {
    ensureDataDir();
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('❌ Failed to save data store:', error);
    }
}

function scheduleSave() {
    if (writeTimer) {
        clearTimeout(writeTimer);
    }
    writeTimer = setTimeout(() => {
        saveData();
        writeTimer = null;
    }, 1000);
}

function getFavorites(userId) {
    if (!userId) return [];
    if (!data.favorites[userId]) {
        data.favorites[userId] = [];
    }
    return data.favorites[userId];
}

function addFavorite(userId, track) {
    if (!userId || !track || !track.url) return;
    const favorites = getFavorites(userId);
    const exists = favorites.some(f => f.url === track.url);
    if (!exists) {
        favorites.push({
            title: track.title || track.url,
            url: track.url,
            sourceType: track.sourceType || 'youtube',
            videoId: track.videoId || null,
            durationMs: track.durationMs || null
        });
        scheduleSave();
    }
}

function removeFavorite(userId, index) {
    const favorites = getFavorites(userId);
    if (index < 0 || index >= favorites.length) {
        return false;
    }
    favorites.splice(index, 1);
    scheduleSave();
    return true;
}

function getGuildPlaylists(guildId) {
    if (!guildId) return [];
    if (!data.playlists[guildId]) {
        data.playlists[guildId] = [];
    }
    return data.playlists[guildId];
}

function setGuildPlaylists(guildId, playlists) {
    data.playlists[guildId] = playlists;
    scheduleSave();
}

function getGuildFilters(guildId) {
    if (!guildId) return { preset: 'flat', custom: null };
    if (!data.filters[guildId]) {
        data.filters[guildId] = { preset: 'flat', custom: null };
    }
    return data.filters[guildId];
}

function setGuildFilters(guildId, filters) {
    if (!guildId || !filters) return;
    data.filters[guildId] = filters;
    scheduleSave();
}

function recordPlayback(guildId, track, userId, userTag) {
    if (!guildId || !track) return;

    const { analytics } = data;
    if (!analytics.playbackHistory[guildId]) {
        analytics.playbackHistory[guildId] = [];
    }
    if (!analytics.topTracks[guildId]) {
        analytics.topTracks[guildId] = {};
    }
    if (!analytics.topRequesters[guildId]) {
        analytics.topRequesters[guildId] = {};
    }

    analytics.playbackHistory[guildId].unshift({
        title: track.title || track.cleanUrl,
        url: track.cleanUrl,
        requestedBy: userTag || userId || 'Unknown',
        requestedById: userId || null,
        playedAt: new Date().toISOString(),
        durationMs: track.durationMs || null
    });

    analytics.playbackHistory[guildId] = analytics.playbackHistory[guildId].slice(0, 100);

    const trackKey = track.cleanUrl || track.title;
    if (trackKey) {
        const topTracks = analytics.topTracks[guildId];
        if (!topTracks[trackKey]) {
            topTracks[trackKey] = {
                title: track.title || track.cleanUrl,
                url: track.cleanUrl,
                playCount: 0
            };
        }
        topTracks[trackKey].playCount += 1;
    }

    if (userId) {
        const topRequesters = analytics.topRequesters[guildId];
        if (!topRequesters[userId]) {
            topRequesters[userId] = {
                tag: userTag || userId,
                playCount: 0
            };
        }
        topRequesters[userId].playCount += 1;
    }

    scheduleSave();
}

function getGuildAnalytics(guildId) {
    if (!guildId) return {
        history: [],
        topTracks: [],
        topRequesters: []
    };

    const { analytics } = data;
    const history = analytics.playbackHistory[guildId] || [];
    const topTracksMap = analytics.topTracks[guildId] || {};
    const topRequestersMap = analytics.topRequesters[guildId] || {};

    const topTracks = Object.values(topTracksMap)
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 10);

    const topRequesters = Object.entries(topRequestersMap)
        .map(([id, entry]) => ({ userId: id, ...entry }))
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 10);

    return {
        history,
        topTracks,
        topRequesters
    };
}

module.exports = {
    loadData,
    saveData,
    getFavorites,
    addFavorite,
    removeFavorite,
    getGuildPlaylists,
    setGuildPlaylists,
    getGuildFilters,
    setGuildFilters,
    recordPlayback,
    getGuildAnalytics
};
