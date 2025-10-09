// Utility function to cleanup processes
function cleanupProcesses(ytdlpProcess, ffmpegProcess) {
    try {
        if (ytdlpProcess && !ytdlpProcess.killed) {
            ytdlpProcess.kill('SIGKILL');
            console.log('yt-dlp process killed successfully');
        }
    } catch (e) {
        console.error('Error killing yt-dlp:', e);
    }

    try {
        if (ffmpegProcess && !ffmpegProcess.killed) {
            ffmpegProcess.kill('SIGKILL');
            console.log('FFmpeg process killed successfully');
        }
    } catch (e) {
        console.error('Error killing FFmpeg:', e);
    }
}

module.exports = cleanupProcesses;