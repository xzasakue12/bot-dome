const ytdl = require('@distube/ytdl-core');
const config = require('../config');

/**
 * ค้นหาวิดีโอจาก YouTube โดยใช้ YouTube API
 */
async function searchYouTubeAPI(query, limit = 5) {
    try {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            console.error('❌ YOUTUBE_API_KEY not found in environment variables');
            return [];
        }

        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${limit}&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
        
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        if (data.error) {
            console.error('YouTube API Error:', data.error.message);
            return [];
        }
        
        if (data.items && data.items.length > 0) {
            return data.items.map(item => ({
                title: item.snippet.title,
                url: `https://www.youtube.com/watch?v=${item.videoId}`,
                videoId: item.videoId,
                thumbnail: item.snippet.thumbnails.default.url,
                channelTitle: item.snippet.channelTitle
            }));
        }
    } catch (error) {
        console.error('YouTube API search error:', error);
    }
    return [];
}

/**
 * ค้นหาวิดีโอจาก YouTube โดยใช้ yt-dlp (fallback)
 */
async function searchYouTubeYtDlp(query, limit = 5) {
    try {
        const { spawn } = require('child_process');
        const { getYtDlpPath } = require('./helpers');
        
        const ytDlpPath = getYtDlpPath();
        
        return new Promise((resolve, reject) => {
            const ytdlpProcess = spawn(ytDlpPath, [
                `ytsearch${limit}:${query}`,
                '--get-id',
                '--get-title',
                '--no-warnings',
                '--quiet'
            ]);

            let output = '';
            ytdlpProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            ytdlpProcess.on('close', (code) => {
                if (code === 0) {
                    const lines = output.trim().split('\n');
                    const results = [];
                    
                    for (let i = 0; i < lines.length; i += 2) {
                        if (lines[i] && lines[i + 1]) {
                            results.push({
                                title: lines[i],
                                url: `https://www.youtube.com/watch?v=${lines[i + 1]}`,
                                videoId: lines[i + 1]
                            });
                        }
                    }
                    
                    resolve(results);
                } else {
                    resolve([]);
                }
            });

            ytdlpProcess.on('error', (err) => {
                console.error('yt-dlp search error:', err);
                resolve([]);
            });
        });
    } catch (error) {
        console.error('yt-dlp search error:', error);
        return [];
    }
}

/**
 * สุ่มเพลงจาก YouTube
 */
async function getRandomYouTubeVideo() {
    try {
        const randomQuery = config.autoplayQueries[
            Math.floor(Math.random() * config.autoplayQueries.length)
        ];
        
        console.log(`🔍 Searching YouTube for: ${randomQuery}`);
        
        // ลองใช้ YouTube API ก่อน
        let searchResult = await searchYouTubeAPI(randomQuery, 20);
        
        // ถ้าไม่ได้ ลอง yt-dlp
        if (searchResult.length === 0) {
            console.log('Trying yt-dlp search...');
            searchResult = await searchYouTubeYtDlp(randomQuery, 20);
        }
        
        if (searchResult && searchResult.length > 0) {
            const randomIndex = Math.floor(Math.random() * searchResult.length);
            const video = searchResult[randomIndex];
            console.log(`✅ Found random video: ${video.title}`);
            return video.url;
        }
    } catch (e) {
        console.error('❌ Random YouTube search error:', e);
    }
    return null;
}

/**
 * ค้นหาเพลงจาก YouTube
 */
async function searchYouTube(query, limit = 5) {
    try {
        // ลองใช้ YouTube API ก่อน
        let results = await searchYouTubeAPI(query, limit);
        
        // ถ้าไม่ได้ ลอง yt-dlp
        if (results.length === 0) {
            console.log('Trying yt-dlp search...');
            results = await searchYouTubeYtDlp(query, limit);
        }
        
        return results;
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

/**
 * ดึงข้อมูลวิดีโอจาก ytdl-core
 */
async function getVideoInfo(url) {
    try {
        // ตรวจสอบว่าเป็น YouTube URL ที่ถูกต้อง
        if (!ytdl.validateURL(url)) {
            console.error('Invalid YouTube URL:', url);
            return null;
        }

        const info = await ytdl.getInfo(url);
        
        if (info && info.videoDetails) {
            return {
                title: info.videoDetails.title,
                url: info.videoDetails.video_url,
                duration: parseInt(info.videoDetails.lengthSeconds),
                thumbnail: info.videoDetails.thumbnails[0]?.url,
                author: info.videoDetails.author.name
            };
        }
    } catch (error) {
        console.error('Error getting video info:', error);
    }
    return null;
}

module.exports = {
    getRandomYouTubeVideo,
    searchYouTube,
    getVideoInfo
};