# PowerShell script to create Windows Task Scheduler for Discord Bot
# Run this script as Administrator

$taskName = "Discord-Music-Bot-Startup"
$scriptPath = "C:\Users\xzasakue12\my-discord-music-bot\startup-bot.bat"
$workingDir = "C:\Users\xzasakue12\my-discord-music-bot"

Write-Host "Creating Windows Task Scheduler for Discord Music Bot..." -ForegroundColor Cyan

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "Task already exists. Removing old task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Create action
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$scriptPath`"" -WorkingDirectory $workingDir

# Create trigger (at startup + delay 30 seconds)
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT30S"  # 30 seconds delay

# Create settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Create principal (run with highest privileges)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

# Register the task
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Auto-start Discord Music Bot with PM2"

Write-Host "✅ Task created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Task Name: $taskName" -ForegroundColor Yellow
Write-Host "Script: $scriptPath" -ForegroundColor Yellow
Write-Host "Trigger: At Windows startup (30s delay)" -ForegroundColor Yellow
Write-Host ""
Write-Host "To test the task, run:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor White
Write-Host ""
Write-Host "To view task:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTask -TaskName '$taskName'" -ForegroundColor White
Write-Host ""
Write-Host "To remove task:" -ForegroundColor Cyan
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName'" -ForegroundColor White
