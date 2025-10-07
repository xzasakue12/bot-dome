@echo off
echo.
echo ==============================================
echo   Discord Music Bot - Control Panel
echo ==============================================
echo.
echo [1] Start Bot
echo [2] Stop Bot  
echo [3] Restart Bot
echo [4] View Bot Status
echo [5] View Bot Logs
echo [6] Exit
echo.
set /p choice="Please select an option (1-6): "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto restart
if "%choice%"=="4" goto status
if "%choice%"=="5" goto logs
if "%choice%"=="6" goto exit

:start
echo Starting Discord Music Bot...
pm2 start index.js --name my-discord-music-bot
pm2 save
goto menu

:stop
echo Stopping Discord Music Bot...
pm2 stop my-discord-music-bot
goto menu

:restart
echo Restarting Discord Music Bot...
pm2 restart my-discord-music-bot
goto menu

:status
echo Discord Music Bot Status:
pm2 list
goto menu

:logs
echo Discord Music Bot Logs (Press Ctrl+C to exit):
pm2 logs my-discord-music-bot
goto menu

:menu
echo.
pause
cls
goto start

:exit
echo Goodbye!
pause
exit