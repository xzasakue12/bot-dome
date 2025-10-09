// utils/buildFfmpegArgs.js
function buildFfmpegArgs() {
    const args = [
        '-i', 'pipe:0',
        
        // Audio processing
        '-af', 'bass=g=10',
        
        // Output settings
        '-b:a', '128k',
        '-f', 'opus',
        '-ar', '48000',  // ⭐ เพิ่ม sample rate ที่ชัดเจน
        '-ac', '2',      // ⭐ stereo channels
        
        // Logging (เปลี่ยนจาก info เป็น error เพื่อลด noise)
        '-hide_banner',
        '-loglevel', 'error',  // ⭐ แก้ไขตรงนี้
        
        // Output
        'pipe:1'
    ];
    
    return args;
}

module.exports = buildFfmpegArgs;