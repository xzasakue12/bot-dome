// utils/buildYtDlpArgs.js
function buildYtDlpArgs(cleanUrl) {
    const args = [
        // Headers & User Agent
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        
        // Network & Retry Settings
        '--socket-timeout', '30',
        '--retries', '10',
        '--fragment-retries', '10',
        '--buffer-size', '64K',
        
        // Format Selection - สำคัญมาก!
        '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best',
        
        // Output Settings
        '--no-playlist',
        '--no-warnings',
        '--ignore-errors',
        '--no-check-certificate',
        
        // Print duration info to stderr (ใช้ดึง duration)
        '--print', 'duration',
        
        // Output to stdout
        '-o', '-',
        
        cleanUrl
    ];
    
    return args;
}

module.exports = buildYtDlpArgs;