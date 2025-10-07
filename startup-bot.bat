@echo off
REM Auto-start Discord Music Bot with PM2
REM This script runs at Windows startup

echo Starting Discord Music Bot...

REM Change to bot directory
cd /d "C:\Users\xzasakue12\my-discord-music-bot"

REM Wait for network (important!)
timeout /t 10 /nobreak >nul

REM Check if PM2 process already exists
pm2 describe my-discord-music-bot >nul 2>&1
if %errorlevel% equ 0 (
    echo Bot process exists, restarting...
    pm2 restart my-discord-music-bot
) else (
    echo Starting new bot process...
    pm2 start ecosystem.config.js
)

REM Save PM2 list
pm2 save

echo Bot started successfully!
exit
