const { createAudioResource, StreamType } = require('@discordjs/voice');
const play = require('play-dl');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const buildFfmpegArgs = require('../utils/buildFfmpegArgs');
const { refreshSpotifyTokenIfNeeded, ensureSoundcloudToken } = require('../utils/playDlToken');

function mapPlayStreamType(type) {
    const playStreamType = (play && play.StreamType) || {};

    switch (type) {
        case playStreamType.Opus:
        case 'opus':
            return StreamType.Opus;
        case playStreamType.OggOpus:
        case 'ogg_opus':
            return StreamType.OggOpus;
        case playStreamType.WebmOpus:
        case 'webm_opus':
            return StreamType.WebmOpus;
        default:
            return StreamType.Arbitrary;
    }
}

async function createResourceWithPlayDl(track) {
    if (track && track.sourceType === 'soundcloud') {
        await ensureSoundcloudToken();
    }
    await refreshSpotifyTokenIfNeeded();

    const streamInfo = await play.stream(track.cleanUrl, { discordPlayerCompatibility: true });
    const audioStream = streamInfo.stream;
    let hasData = false;

    audioStream.once('readable', () => {
        hasData = true;
    });
    audioStream.once('data', () => {
        hasData = true;
    });

    const resource = createAudioResource(audioStream, {
        inputType: mapPlayStreamType(streamInfo.type),
        inlineVolume: true
    });

    resource.metadata = {
        cleanup: () => {
            try {
                audioStream.destroy();
            } catch (err) {
                console.error('❌ play-dl cleanup error:', err.message || err);
            }
        },
        hasReceivedData: () => hasData,
        expectedDuration: track.durationMs || null
    };

    audioStream.once('error', (error) => {
        console.error('❌ play-dl stream error:', error.message || error);
    });

    return resource;
}

function createFfmpegResourceFromReadable(readable, track) {
    return new Promise((resolve, reject) => {
        const ffmpegArgs = buildFfmpegArgs();
        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let resolved = false;
        let hasData = false;

        const cleanup = () => {
            try {
                readable.destroy();
            } catch (err) {
                console.error('❌ Input stream cleanup error:', err.message || err);
            }

            try {
                if (ffmpegProcess && !ffmpegProcess.killed) {
                    ffmpegProcess.kill('SIGKILL');
                }
            } catch (err) {
                console.error('❌ FFmpeg cleanup error:', err.message || err);
            }
        };

        const resource = createAudioResource(ffmpegProcess.stdout, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });

        resource.metadata = {
            cleanup,
            hasReceivedData: () => hasData,
            expectedDuration: track.durationMs || null
        };

        const finalize = (error) => {
            if (resolved) return;
            resolved = true;

            if (error) {
                cleanup();
                reject(error);
            } else {
                resolve(resource);
            }
        };

        ffmpegProcess.stdout.once('data', () => {
            hasData = true;
            finalize(null);
        });

        ffmpegProcess.stderr.on('data', (data) => {
            const message = data.toString();
            if (message.toLowerCase().includes('error')) {
                console.error('❌ FFmpeg stderr:', message.trim());
            }
        });

        ffmpegProcess.on('error', (error) => finalize(error));

        ffmpegProcess.on('close', (code) => {
            if (resolved) return;
            finalize(new Error(`FFmpeg exited with code ${code}`));
        });

        readable.on('error', (error) => finalize(error));

        readable.pipe(ffmpegProcess.stdin).on('error', (error) => finalize(error));
    });
}

function createResourceFromLocal(track) {
    const filePath = track.streamData?.path || track.cleanUrl;
    if (!filePath || !fs.existsSync(filePath)) {
        const error = new Error('ไม่พบไฟล์บนเครื่องนี้');
        error.code = 'LOCAL_FILE_MISSING';
        throw error;
    }

    const stream = fs.createReadStream(filePath);
    return createFfmpegResourceFromReadable(stream, track);
}

function createResourceFromHttp(track) {
    return new Promise((resolve, reject) => {
        const transport = track.cleanUrl.startsWith('https') ? https : http;
        const request = transport.get(track.cleanUrl, (response) => {
            if (response.statusCode && response.statusCode >= 400) {
                request.destroy();
                return reject(new Error(`HTTP ${response.statusCode} จากแหล่งเสียง`));
            }

            createFfmpegResourceFromReadable(response, track)
                .then(resolve)
                .catch(reject);
        });

        request.on('error', (error) => reject(error));
    });
}

async function createResourceForTrack(track, options = {}) {
    const { fallback } = options;

    if (!track || !track.sourceType) {
        throw new Error('ข้อมูลเพลงไม่ถูกต้อง');
    }

    switch (track.sourceType) {
        case 'local':
            return createResourceFromLocal(track);
        case 'http-audio':
            return createResourceFromHttp(track);
        case 'soundcloud':
            return createResourceWithPlayDl(track);
        case 'youtube':
            try {
                return await createResourceWithPlayDl(track);
            } catch (error) {
                console.warn('⚠️ play-dl ไม่สามารถเปิด YouTube ได้ กำลังใช้ yt-dlp แทน');
                if (typeof fallback === 'function') {
                    return fallback(error);
                }
                throw error;
            }
        default:
            if (typeof fallback === 'function') {
                return fallback(new Error(`ไม่รองรับแหล่งที่มา ${track.sourceType}`));
            }
            throw new Error(`ไม่รองรับแหล่งที่มา ${track.sourceType}`);
    }
}

module.exports = {
    createResourceForTrack
};
