# (ส่วนบนสุดเหมือนเดิม)
FROM node:18-alpine
WORKDIR /usr/src/app

# ติดตั้ง FFmpeg, python3, git และดาวน์โหลด yt-dlp ตัวจริง
RUN apk add --no-cache ffmpeg python3 git && \
    wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

COPY package*.json ./
RUN npm install

# คัดลอกไฟล์โปรเจกต์ที่เหลือ (ยกเว้น yt-dlp ที่เราจัดการไปแล้ว)
COPY . .

# [ลบออก] ไม่ต้อง chmod /usr/src/app/yt-dlp แล้ว เพราะเราจะใช้ตัวที่ /usr/local/bin/yt-dlp แทน
# RUN chmod +x /usr/src/app/yt-dlp

CMD [ "node", "src/bot.js" ]