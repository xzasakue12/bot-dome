const playdl = require('play-dl');
const config = require('../config');

/**
 * สุ่มเพลงจาก YouTube
 */
async function getRandomYouTubeVideo() {
    try {
        const randomQuery = config.autoplayQueries[
            Math.floor(Math.random() * config.autoplayQueries.length)
        ];
        
        console.log(`🔍 Searching YouTube for: ${randomQuery}`);
        
        const searchResult = await playdl.search(randomQuery, {
            limit: 20,
            source: { youtube: 'video' }
        });
        
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
        const searchResult = await playdl.search(query, {
            limit,
            source: { youtube: 'video' }
        });
        
        return searchResult || [];
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

/**
 * ดึงข้อมูลวิดีโอ
 */
async function getVideoInfo(url) {
    try {
        const videoInfo = await playdl.video_info(url);
        if (videoInfo && videoInfo.video_details) {
            return {
                title: videoInfo.video_details.title,
                url: videoInfo.video_details.url,
                duration: videoInfo.video_details.durationInSec,
                thumbnail: videoInfo.video_details.thumbnails[0]?.url
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
