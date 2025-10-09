const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const play = require('play-dl');
const config = require('../config');
const { getYtDlpPath } = require('../utils/helpers');
const extractVideoId = require('../utils/extractVideoId');
const fetch = require('node-fetch');
const { refreshSpotifyTokenIfNeeded, ensureSoundcloudToken } = require('../utils/playDlToken');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.opus']);

async function getVideoTitle(url) {
    return new Promise((resolve) => {
        try {
            const ytDlpPath = getYtDlpPath();
            const process = spawn(ytDlpPath, [
                '--get-title',
                '--no-warnings',
                '--no-playlist',
                url
            ]);

            let title = '';
            process.stdout.on('data', (data) => {
                title += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0 && title.trim()) {
                    resolve(title.trim());
                } else {
                    resolve(null);
                }
            });

            process.on('error', () => resolve(null));
        } catch (e) {
            resolve(null);
        }
    });
}

async function getVideoTitleFromApi(videoId) {
    try {
        const apiKey = process.env.YOUTUBE_API_KEY || config.youtubeApiKey;
        if (!apiKey) return null;
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.items && data.items.length > 0) {
            return data.items[0].snippet.title;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function resolveLocalPath(input) {
    if (!input) return null;

    let candidate = input;
    if (candidate.startsWith('~/')) {
        candidate = path.join(process.env.HOME || process.cwd(), candidate.slice(2));
    }

    const resolved = path.resolve(candidate);

    try {
        const stats = fs.statSync(resolved);
        if (stats.isFile()) {
            return resolved;
        }
    } catch (e) {
        return null;
    }

    return null;
}

function detectSource(rawInput) {
    if (!rawInput) {
        return { type: 'unknown' };
    }

    const trimmed = rawInput.trim();
    if (!trimmed) {
        return { type: 'unknown' };
    }

    if (/^file:\/\//i.test(trimmed)) {
        const filePath = decodeURIComponent(trimmed.replace(/^file:\/\//i, ''));
        const resolved = resolveLocalPath(filePath);
        if (resolved) {
            return { type: 'local', path: resolved };
        }
        return { type: 'unknown' };
    }

    try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.toLowerCase();

        if (host.includes('youtube.com') || host === 'youtu.be') {
            let videoId = null;
            try {
                videoId = extractVideoId(parsed.toString());
            } catch (e) {
                videoId = null;
            }

            if (!videoId) {
                return { type: 'unknown' };
            }

            return {
                type: 'youtube',
                url: `https://www.youtube.com/watch?v=${videoId}`,
                videoId
            };
        }

        if (host.includes('soundcloud.com') || host === 'snd.sc') {
            return { type: 'soundcloud', url: parsed.toString() };
        }

        if (host.includes('spotify.com')) {
            const segments = parsed.pathname.split('/').filter(Boolean);
            const spotifyTypes = new Set(['track', 'album', 'playlist']);
            let spotifyType = null;
            let spotifyId = null;

            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i].toLowerCase();
                if (spotifyTypes.has(segment)) {
                    spotifyType = segment;
                    spotifyId = segments[i + 1] ? segments[i + 1].split('?')[0] : null;
                    break;
                }
            }

            return {
                type: 'spotify',
                url: parsed.toString(),
                spotifyType: spotifyType || null,
                spotifyId: spotifyId || null
            };
        }

        const ext = path.extname(parsed.pathname).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
            return { type: 'http-audio', url: parsed.toString() };
        }

        return { type: 'unknown', url: parsed.toString() };
    } catch (e) {
        const resolved = resolveLocalPath(trimmed);
        if (resolved) {
            return { type: 'local', path: resolved };
        }
        return { type: 'unknown', url: trimmed };
    }
}

function buildHttpTitle(urlString) {
    try {
        const parsed = new URL(urlString);
        const base = path.basename(parsed.pathname);
        const decoded = decodeURIComponent(base);
        return decoded || parsed.hostname;
    } catch (e) {
        return urlString;
    }
}

function buildLocalTitle(filePath) {
    return path.basename(filePath);
}

async function fetchYouTubeMetadata(url, videoId) {
    let title = url;
    let durationMs = null;

    try {
        await refreshSpotifyTokenIfNeeded();

        const info = await play.video_basic_info(url);
        if (info && info.video_details) {
            title = info.video_details.title || title;
            if (info.video_details.durationInSec) {
                durationMs = info.video_details.durationInSec * 1000;
            }
        }
    } catch (error) {
        console.warn('⚠️ play-dl YouTube metadata failed:', error.message || error);
    }

    if (!title || title === url) {
        try {
            const fallbackTitle = await getVideoTitle(url);
            if (fallbackTitle) {
                title = fallbackTitle;
            } else if (videoId) {
                const apiTitle = await getVideoTitleFromApi(videoId);
                if (apiTitle) {
                    title = apiTitle;
                }
            }
        } catch (e) {
            console.error('❌ YouTube metadata fallback error:', e);
        }
    }

    return { title: title || url, url, durationMs };
}

async function fetchSoundCloudMetadata(url) {
    let title = url;
    let durationMs = null;

    try {
        await ensureSoundcloudToken();
        await refreshSpotifyTokenIfNeeded();

        const info = await play.soundcloud(url);
        if (info) {
            title = info.name || info.title || title;
            if (info.durationInSec) {
                durationMs = info.durationInSec * 1000;
            }
        }
    } catch (error) {
        console.warn('⚠️ SoundCloud metadata failed:', error.message || error);
    }

    return { title, url, durationMs };
}

async function fetchSpotifyMetadata(url, spotifyType) {
    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
        const res = await fetch(oembedUrl);
        if (!res.ok) {
            throw new Error(`Spotify oEmbed request failed with status ${res.status}`);
        }

        const data = await res.json();
        const title = data.title || url;
        const author = data.author_name || '';
        const searchQuery = [title, author].filter(Boolean).join(' ');

        return {
            title,
            author,
            searchQuery,
            thumbnail: data.thumbnail_url || null,
            type: spotifyType || null
        };
    } catch (error) {
        console.warn('⚠️ Spotify metadata failed:', error.message || error);
        return null;
    }
}

async function resolveTrack(input) {
    const source = detectSource(input);
    if (!source || source.type === 'unknown') {
        return null;
    }

    switch (source.type) {
        case 'youtube': {
            const metadata = await fetchYouTubeMetadata(source.url, source.videoId);
            return {
                ...metadata,
                sourceType: 'youtube',
                streamData: null,
                durationMs: metadata.durationMs || null,
                videoId: source.videoId
            };
        }
        case 'soundcloud': {
            const metadata = await fetchSoundCloudMetadata(source.url);
            return {
                ...metadata,
                sourceType: 'soundcloud',
                streamData: null,
                durationMs: metadata.durationMs || null,
                videoId: null
            };
        }
        case 'spotify': {
            const metadata = await fetchSpotifyMetadata(source.url, source.spotifyType);
            if (!metadata || !metadata.searchQuery) {
                return null;
            }

            let searchResults = [];
            try {
                searchResults = await play.search(metadata.searchQuery, {
                    limit: 1,
                    source: { youtube: 'video' }
                });
            } catch (error) {
                console.warn('⚠️ Spotify → YouTube search failed:', error.message || error);
            }

            if (!searchResults || !searchResults.length) {
                return null;
            }

            const bestMatch = searchResults[0];
            const youtubeUrl = bestMatch.url;
            const youtubeMetadata = await fetchYouTubeMetadata(youtubeUrl, bestMatch.id);

            return {
                ...youtubeMetadata,
                title: youtubeMetadata.title || metadata.title,
                url: youtubeUrl,
                sourceType: 'youtube',
                streamData: null,
                durationMs: youtubeMetadata.durationMs || null,
                videoId: bestMatch.id || null,
                originalSource: {
                    type: 'spotify',
                    url: source.url,
                    searchQuery: metadata.searchQuery
                }
            };
        }
        case 'http-audio':
            return {
                title: buildHttpTitle(source.url),
                url: source.url,
                sourceType: 'http-audio',
                streamData: null,
                durationMs: null,
                videoId: null
            };
        case 'local':
            return {
                title: buildLocalTitle(source.path),
                url: source.path,
                sourceType: 'local',
                streamData: { path: source.path },
                durationMs: null,
                videoId: null
            };
        default:
            return null;
    }
}

module.exports = {
    name: 'play',
    description: 'เล่นเพลงจากลิงก์หรือไฟล์เสียง',
    
    async execute(message, args) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ คุณต้องอยู่ในห้องเสียงก่อน');
        }

        const argInput = args.length ? args.join(' ').trim() : '';
        let rawInput = argInput;

        if (!rawInput) {
            const urlMatch = message.content.match(/https?:\/\/\S+/i);
            if (urlMatch && urlMatch[0]) {
                rawInput = urlMatch[0];
            }
        }

        if (!rawInput) {
            return message.reply('❌ กรุณาใส่ลิงก์เพลง, URL เสียง, หรือระบุไฟล์บนเครื่อง');
        }

        const trackInfo = await resolveTrack(rawInput);
        if (!trackInfo) {
            return message.reply('❌ ไม่สามารถประมวลผลแหล่งเสียงนี้ได้');
        }

        const trackTitle = trackInfo.title || trackInfo.url;

        config.state.lastTextChannel = message.channel;

        const wasPlaying = config.state.isPlaying;

        config.queue.push({
            cleanUrl: trackInfo.url,
            voiceChannel,
            message,
            textChannel: message.channel,
            title: trackTitle,
            sourceType: trackInfo.sourceType,
            streamData: trackInfo.streamData || null,
            durationMs: trackInfo.durationMs || null,
            videoId: trackInfo.videoId || null
        });

        if (wasPlaying) {
            const queuePosition = config.queue.length;
            await message.reply(`✅ เพิ่มเข้าคิวที่ ${queuePosition}: **${trackTitle}**`);
        } else {
            await message.reply(`✅ เพิ่มเข้าคิว: **${trackTitle}**`);
        }

        if (!wasPlaying) {
            const { playNext } = require('../handlers/player');
            playNext(voiceChannel.guild.id);
        }
    }
};