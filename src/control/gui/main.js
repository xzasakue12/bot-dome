const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const {
    startBot,
    stopBot,
    restartBot,
    getStatus,
    getLogs
} = require('../pm2Controller');

function createWindow() {
    const window = new BrowserWindow({
        width: 960,
        height: 720,
        minWidth: 720,
        minHeight: 560,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    window.setMenuBarVisibility(false);
    window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.botdome.control');
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function wrap(handler) {
    return async (...args) => {
        try {
            const result = await handler(...args);
            return result || '';
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            const err = new Error(message);
            err.code = error.code;
            err.stdout = error.stdout;
            err.stderr = error.stderr;
            throw err;
        }
    };
}

ipcMain.handle('pm2:start', wrap(startBot));
ipcMain.handle('pm2:stop', wrap(stopBot));
ipcMain.handle('pm2:restart', wrap(restartBot));
ipcMain.handle('pm2:status', wrap(getStatus));
ipcMain.handle('pm2:logs', wrap((lines) => getLogs(lines)));
