// Utility function to build ffmpeg arguments
function buildFfmpegArgs() {
    const args = [
        '-i', 'pipe:0',
        '-af', 'bass=g=10',
        '-b:a', '64k',
        '-f', 'opus',
        '-hide_banner', '-loglevel', 'error',
        'pipe:1'
    ];
    return args;
}

module.exports = buildFfmpegArgs;