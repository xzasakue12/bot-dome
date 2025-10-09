// utils/buildYtDlpArgs.js
function buildYtDlpArgs(cleanUrl) {
    const args = [
        // Headers & User Agent
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        
        // Network & Retry Settings
        '--socket-timeout', '30',
        '--retries', '10',
        '--fragment-retries', '10',
        '--buffer-size', '256K',  // ⭐ เพิ่มจาก 64K เป็น 256K
        
        // Format Selection - ใช้ง่ายๆ ก่อน
        '--format', 'bestaudio/best',  // ⭐ ทำให้ง่ายขึ้น
        '--extract-audio',             // ⭐ บังคับให้ดึงแต่เสียง
        
        // Output Settings
        '--no-playlist',
        '--no-warnings',
        '--ignore-errors',
        '--no-check-certificate',
        '--prefer-free-formats',  // ⭐ เพิ่ม
        
        // ⭐ ลบ --print ออกเพราะมันทำให้ไม่ส่งข้อมูลเสียง!
        // ใช้วิธีอื่นดึง duration แทน (ดูใน playWithYtDlp)
        
        // Output to stdout
        '-o', '-',
        
        cleanUrl
    ];
    
    return args;
}

module.exports = buildYtDlpArgs;