# Discord Music Bot Auto Start Script
Set-Location "c:\Users\xzasakue12\my-discord-music-bot"

# Try to resurrect saved PM2 processes
try {
    pm2 resurrect
    Write-Host "✅ PM2 processes restored successfully!"
} catch {
    Write-Host "⚠️ PM2 resurrect failed, starting fresh..."
    pm2 start index.js --name my-discord-music-bot
}

# Show PM2 status
pm2 list
Write-Host "🎵 Discord Music Bot is now running!"