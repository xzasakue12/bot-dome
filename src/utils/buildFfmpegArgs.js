function buildFfmpegArgs(options = {}) {
    const {
        input = 'pipe:0',
        inputArgs = [],
        filters = null
    } = options;

    const args = [
        ...inputArgs,
        '-hide_banner',
        '-loglevel', 'error',
        '-i', input,
        '-analyzeduration', '0',
        '-map', '0:a:0'
    ];

    if (filters) {
        args.push('-af', filters);
    }

    args.push(
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        '-acodec', 'pcm_s16le',
        'pipe:1'
    );

    return args;
}

module.exports = buildFfmpegArgs;