// Utility function to build yt-dlp arguments
function buildYtDlpArgs(cleanUrl) {
    const args = [
        '--user-agent', 'Mozilla/5.0',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--buffer-size', '64K',
        '--retries', '5',
        '-f', 'bestaudio/best',
        '--no-playlist',
        '--no-warnings',
        '--ignore-errors',
        '--extract-audio',
        '--audio-format', 'opus',
        '-o', '-',
        cleanUrl
    ];
    return args;
}

module.exports = buildYtDlpArgs;