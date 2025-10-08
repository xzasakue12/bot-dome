// Configuration file
module.exports = {
    // ระบบคิว
    queue: [],
    
    // สถานะการเล่น
    state: {
        isPlaying: false,
        isPaused: false,
        currentConnection: null,
        currentPlayer: null,
        currentSong: null,
        lastPlayedVideoId: null,
        lastTextChannel: null,
        leaveTimeout: null,
    },
    
    // การเล่นซ้ำ
    loop: {
        mode: 'off', // 'off', 'song', 'queue'
        originalQueue: []
    },
    
    // คำค้นหาสำหรับ autoplay
    autoplayQueries: [
        'anime opening',
        'anime ending',
        'japanese anime song',
        'anime ost',
        'j-pop anime',
        'anime music',
        'แร็พไทย',
        'thai rap',
        'rap thai',
        'ไทยแร็พ',
        'thai hiphop',
        'แร็พเพลงไทย'
    ],
    
    // ตั้งค่าต่างๆ
    settings: {
        prefix: '!', // คำนำหน้าคำสั่ง
        autoplayEnabled: true, // เปิด/ปิด autoplay
        leaveTimeout: 60000, // 60 วินาที
        autoplayDelay: 3000, // 3 วินาที
        voiceChannelCheckDelay: 2000 // 2 วินาที
    },

    // Audio settings
    audioSettings: {
        bassGain: 10 // Default bass gain in dB
    }
};
