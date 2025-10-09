// Utility function to extract video ID from a URL
function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        }
        if (urlObj.hostname.includes('youtu.be')) {
            return urlObj.pathname.slice(1);
        }
        return null;
    } catch (e) {
        console.error('Error extracting video ID:', e);
        return null;
    }
}

module.exports = extractVideoId;