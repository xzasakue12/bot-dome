const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

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

function cleanupFragments() {
    let entries;
    try {
        entries = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
    } catch (error) {
        console.error('Error reading project directory for fragment cleanup:', error);
        return;
    }

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const name = entry.name;
        if (!name.startsWith('--Frag')) continue;

        const targetPath = path.join(PROJECT_ROOT, name);
        try {
            fs.unlinkSync(targetPath);
            console.log(`🧹 Removed leftover fragment: ${name}`);
        } catch (error) {
            console.error(`Failed to remove fragment ${name}:`, error.message || error);
        }
    }
}

module.exports = { cleanupProcesses, cleanupFragments };