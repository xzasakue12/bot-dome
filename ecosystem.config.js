module.exports = {
  apps: [
    {
      name: "my-discord-music-bot",
      script: "src/bot.js",
      cwd: "C:/Users/xzasakue12/my-discord-music-bot",
      watch: true, // เปิด auto restart เมื่อไฟล์เปลี่ยน
      ignore_watch: [
        "node_modules",
        "logs",
        ".git",
        "*.log",
        ".env"
      ],
      watch_options: {
        followSymlinks: false,
        usePolling: true, // สำหรับ Windows
        interval: 1000
      },
      env: {
        NODE_ENV: "production"
      },
      time: true, // แสดงเวลาใน log
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      merge_logs: true,
      autorestart: true, // restart อัตโนมัติถ้า crash
      max_restarts: 10, // restart ได้สูงสุด 10 ครั้ง
      min_uptime: "10s", // ต้องรันได้อย่างน้อย 10 วินาที
      restart_delay: 4000 // รอ 4 วินาทีก่อน restart
    }
  ]
}