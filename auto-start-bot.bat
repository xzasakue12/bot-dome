@echo off
cd /d "c:\Users\xzasakue12\my-discord-music-bot"
pm2 resurrect
if errorlevel 1 (
    echo PM2 resurrect failed, starting fresh...
    pm2 start index.js --name my-discord-music-bot
)