const dataStore = require('../services/dataStore');

const PRESETS = {
    flat: null,
    bassboost: 'bass=g=10',
    bassboost_high: 'bass=g=15',
    nightcore: 'asetrate=48000*1.25,aresample=48000,atempo=1.1',
    vaporwave: 'asetrate=48000*0.8,aresample=48000,atempo=0.9',
    treble: 'treble=g=5',
    vocal: 'compand=attacks=0:decays=0:points=-80/-80|-45/-30|-20/-20|0/-20',
    soft: 'acompressor=threshold=-20dB:ratio=2:attack=5:release=50',
    custom: null
};

function listPresets() {
    return Object.keys(PRESETS);
}

function getFilterForGuild(guildId) {
    const filters = dataStore.getGuildFilters(guildId);
    if (!filters) {
        return { preset: 'flat', filterString: PRESETS.flat };
    }

    if (filters.preset === 'custom' && filters.custom) {
        return { preset: 'custom', filterString: filters.custom };
    }

    const preset = filters.preset || 'flat';
    return {
        preset,
        filterString: PRESETS[preset] || null
    };
}

function setPreset(guildId, preset) {
    if (!guildId || !preset) return;
    if (!PRESETS.hasOwnProperty(preset) && preset !== 'custom') {
        throw new Error('Invalid preset');
    }
    const current = dataStore.getGuildFilters(guildId);
    const next = {
        preset,
        custom: preset === 'custom' ? current.custom || null : null
    };
    dataStore.setGuildFilters(guildId, next);
    return next;
}

function setCustomFilter(guildId, filterString) {
    if (!guildId) return;
    const next = {
        preset: 'custom',
        custom: filterString || null
    };
    dataStore.setGuildFilters(guildId, next);
    return next;
}

module.exports = {
    listPresets,
    getFilterForGuild,
    setPreset,
    setCustomFilter
};
