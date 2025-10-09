function buildFfmpegArgs(options = {}) {
    const {
        input = 'pipe:0',
        inputArgs = [],
        filters = 'bass=g=10'
    } = options;

    const args = [
        ...inputArgs,
        '-i', input,
        '-af', filters,
        '-b:a', '128k',
        '-f', 'opus',
        '-ar', '48000',
        '-ac', '2',
        '-hide_banner',
        '-loglevel', 'error',
        'pipe:1'
    ];

    return args;
}

module.exports = buildFfmpegArgs;