// Utility function to cleanup processes
function cleanupProcesses(ytdlpProcess, ffmpegProcess) {
    try {
        if (ytdlpProcess && !ytdlpProcess.killed) {
            ytdlpProcess.kill('SIGKILL');
        }
    } catch (e) {
        console.error('Error killing yt-dlp:', e);
    }

    try {
        if (ffmpegProcess && !ffmpegProcess.killed) {
            ffmpegProcess.kill('SIGKILL');
        }
    } catch (e) {
        console.error('Error killing ffmpeg:', e);
    }
}

module.exports = cleanupProcesses;