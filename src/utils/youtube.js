const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { getYtDlpPath } = require('./helpers');

/**
 * หา cookies path
 */
function getCookiesPath() {
    const cookiesPaths = [
        path.join(__dirname, '../../cookies.txt'),
        path.join('/etc/secrets/cookies.txt'),
        path.join(__dirname, '../cookies.txt'),
        config.cookiesPath
    ];
    
    for (const p of cookiesPaths) {
        if (p && fs.existsSync(p)) {
            return p;
        }
    }
    return null;
}

/**
 * ค้นหาวิดีโอด้วย yt-dlp
 */
async function searchYouTubeYtDlp(query, limit = 5) {
    return new Promise((resolve) => {
        try {
            const ytDlpPath = getYtDlpPath();
            const cookiesPath = getCookiesPath();
            
            const args = [];
            
            // เพิ่ม cookies ถ้ามี
            if (cookiesPath) {
                args.push('--cookies', cookiesPath);
            }
            
            // เพิ่ม search query และ options
            args.push(
                `ytsearch${limit}:${query}`,
                '--get-id',
                '--get-title',
                '--no-warnings',
                '--quiet'
            );
            
            const ytdlpProcess = spawn(ytDlpPath, args);

            let output = '';
            ytdlpProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            ytdlpProcess.on('close', (code) => {
                if (code === 0 && output.trim()) {
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
        } catch (error) {
            console.error('yt-dlp search error:', error);
            resolve([]);
        }
    });
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
        
        const searchResult = await searchYouTubeYtDlp(randomQuery, 20);
        
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
    return await searchYouTubeYtDlp(query, limit);
}

/**
 * ดึงข้อมูลวิดีโอ
 */
async function getVideoInfo(url) {
    return new Promise((resolve) => {
        try {
            const ytDlpPath = getYtDlpPath();
            const cookiesPath = getCookiesPath();
            
            const args = [];
            
            // เพิ่ม cookies ถ้ามี
            if (cookiesPath) {
                args.push('--cookies', cookiesPath);
            }
            
            args.push(
                '--get-title',
                '--get-duration',
                '--get-thumbnail',
                '--no-warnings',
                '--no-playlist',
                url
            );
            
            const process = spawn(ytDlpPath, args);

            let output = '';
            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0 && output.trim()) {
                    const lines = output.trim().split('\n');
                    resolve({
                        title: lines[0] || url,
                        url: url,
                        duration: lines[1] || '0',
                        thumbnail: lines[2] || null
                    });
                } else {
                    resolve(null);
                }
            });

            process.on('error', () => {
                resolve(null);
            });
        } catch (error) {
            console.error('Error getting video info:', error);
            resolve(null);
        }
    });
}

module.exports = {
    getRandomYouTubeVideo,
    searchYouTube,
    getVideoInfo
};