# สคริปต์สร้าง Shortcut อัตโนมัติใน Startup Folder

$botPath = "C:\Users\xzasakue12\my-discord-music-bot\startup-bot.bat"
$startupPath = [System.Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupPath "Discord-Music-Bot.lnk"

Write-Host "🚀 กำลังสร้าง Auto-Start Shortcut..." -ForegroundColor Cyan
Write-Host ""

# ตรวจสอบว่าไฟล์ bat มีอยู่หรือไม่
if (!(Test-Path $botPath)) {
    Write-Host "❌ ไม่พบไฟล์: $botPath" -ForegroundColor Red
    exit 1
}

# ลบ shortcut เก่าถ้ามี
if (Test-Path $shortcutPath) {
    Write-Host "🗑️  ลบ shortcut เก่า..." -ForegroundColor Yellow
    Remove-Item $shortcutPath -Force
}

# สร้าง shortcut ใหม่
$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $botPath
$Shortcut.WorkingDirectory = "C:\Users\xzasakue12\my-discord-music-bot"
$Shortcut.Description = "Discord Music Bot Auto-Start"
$Shortcut.Save()

Write-Host "✅ สร้าง Shortcut สำเร็จ!" -ForegroundColor Green
Write-Host ""
Write-Host "📂 ตำแหน่ง Startup Folder:" -ForegroundColor Yellow
Write-Host "   $startupPath" -ForegroundColor White
Write-Host ""
Write-Host "📄 ไฟล์ Shortcut:" -ForegroundColor Yellow
Write-Host "   $shortcutPath" -ForegroundColor White
Write-Host ""
Write-Host "🎉 บอทจะรันอัตโนมัติเมื่อเปิดเครื่องแล้ว!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 ทดสอบโดย:" -ForegroundColor Cyan
Write-Host "   1. Restart เครื่อง" -ForegroundColor White
Write-Host "   2. หรือ Double-click ที่ shortcut" -ForegroundColor White
Write-Host ""

# เปิด Startup folder
$openFolder = Read-Host "ต้องการเปิด Startup folder ไหม? (y/n)"
if ($openFolder -eq 'y' -or $openFolder -eq 'Y') {
    explorer $startupPath
}
