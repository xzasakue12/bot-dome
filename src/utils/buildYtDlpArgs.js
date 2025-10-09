// utils/buildYtDlpArgs.js
function buildYtDlpArgs(cleanUrl) {
    const args = [
        // ===== Headers & User Agent =====
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        
        // ===== Network & Retry Settings =====
        '--socket-timeout', '30',
        '--retries', '10',
        '--fragment-retries', '10',
        '--concurrent-fragments', '3',      // ⭐ เพิ่ม: download หลาย fragment พร้อมกัน
        '--buffer-size', '16K',             // ✅ ลดลงเป็น 16K (ดีกว่า 256K สำหรับ streaming)
        
        // ===== Format Selection - Audio Only =====
        '--format', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio[ext=opus]/bestaudio', // ✅ เรียงตาม priority
        // ❌ ลบ --extract-audio ออก! (มันทำให้ไม่ส่ง stdout)
        
        // ===== Output Settings =====
        '--no-playlist',
        '--no-warnings',
        '--quiet',                          // ⭐ เพิ่ม: ลด noise ใน stderr
        '--no-check-certificate',
        '--prefer-free-formats',
        
        // ===== Performance =====
        '--no-part',                        // ⭐ ไม่สร้าง .part file
        '--no-mtime',                       // ⭐ ไม่ต้อง preserve timestamp
        
        // ===== Output to stdout =====
        '--output', '-',
        
        cleanUrl
    ];
    
    return args;
}

module.exports = buildYtDlpArgs;