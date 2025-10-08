# bot-dome

# หยุด bot เก่า
pm2 stop all

# ลบ bot เก่า
pm2 delete all

# Start ด้วย ecosystem config ใหม่
pm2 start ecosystem.config.js

# ดูสถานะ
pm2 list

# บันทึก config
pm2 save

# ดู log (กด Ctrl+C เพื่อออก)
pm2 logs my-discord-music-bot