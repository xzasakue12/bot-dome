const { app, BrowserWindow, ipcMain } = require('electron');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const {
    startBot,
    stopBot,
    restartBot,
    getStatus,
    getLogs
} = require('../pm2Controller');

const AUTH_API_BASE = process.env.AUTH_API_BASE || 'http://localhost:4000';
const subscriptionStore = require('../../services/subscriptionStore');

let controlWindow = null;
let loginWindow = null;
let currentRole = null;
let currentToken = null;

function clearSession() {
    currentRole = null;
    currentToken = null;
}

function sendRole(role) {
    currentRole = role;
    if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.webContents.send('auth:role', role ?? null);
    }
}

function createControlWindow() {
    if (controlWindow && !controlWindow.isDestroyed()) {
        return controlWindow;
    }

    controlWindow = new BrowserWindow({
        width: 960,
        height: 720,
        minWidth: 720,
        minHeight: 560,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    controlWindow.setMenuBarVisibility(false);
    controlWindow.loadFile(path.join(__dirname, 'views', 'dashboard', 'index.html'));
    controlWindow.once('ready-to-show', () => {
        controlWindow.show();
        sendRole(currentRole);
    });

    controlWindow.on('closed', () => {
        controlWindow = null;
        if (currentRole) {
            openLoginWindow();
        }
        clearSession();
    });

    return controlWindow;
}

function openLoginWindow() {
    if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.focus();
        return loginWindow;
    }

    loginWindow = new BrowserWindow({
        width: 420,
        height: 420,
        resizable: false,
        minimizable: false,
        maximizable: false,
        title: 'Bot Control Login',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    loginWindow.setMenuBarVisibility(false);
    loginWindow.loadFile(path.join(__dirname, 'views', 'login', 'index.html'));
    loginWindow.on('closed', () => {
        loginWindow = null;
    });

    return loginWindow;
}

function closeLoginWindow() {
    if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
        loginWindow = null;
    }
}

function requireRole(required, handler) {
    return async (...args) => {
        if (!currentRole) {
            throw new Error('Not authenticated.');
        }
        if (required === 'admin' && currentRole !== 'admin') {
            throw new Error('Admin role required.');
        }
        return handler(...args);
    };
}

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

async function resolveProfile(token) {
    const trimmed = typeof token === 'string' ? token.trim() : '';
    if (!trimmed) return null;

    const response = await fetch(`${AUTH_API_BASE}/auth/profile`, {
        headers: {
            Authorization: `Bearer ${trimmed}`
        }
    });

    if (!response.ok) {
        return null;
    }

    const data = await response.json().catch(() => null);
    if (!data || !data.role) {
        return null;
    }

    return { role: data.role, token: trimmed };
}

ipcMain.handle('auth:login', async (_event, token) => {
    const profile = await resolveProfile(token);
    if (!profile) {
        throw new Error('Invalid token.');
    }

    currentToken = profile.token;
    sendRole(profile.role);
    createControlWindow();
    closeLoginWindow();
    return profile.role;
});

ipcMain.handle('auth:get-role', async () => currentRole);

ipcMain.handle('auth:logout', async () => {
    clearSession();
    if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.close();
    }
    openLoginWindow();
    return null;
});

ipcMain.handle('env:get', async (_event, key) => {
    if (key === 'AUTH_API_BASE') return AUTH_API_BASE;
    return undefined;
});

ipcMain.handle('pm2:start', wrap(requireRole('admin', startBot)));
ipcMain.handle('pm2:stop', wrap(requireRole('admin', stopBot)));
ipcMain.handle('pm2:restart', wrap(requireRole('admin', restartBot)));
ipcMain.handle('pm2:status', wrap(requireRole('user', getStatus)));
ipcMain.handle('pm2:logs', wrap(requireRole('user', (lines) => getLogs(lines))));

ipcMain.handle('subs:list', wrap(requireRole('admin', () => subscriptionStore.list())));
ipcMain.handle('subs:create', wrap(requireRole('admin', (_event, payload) => subscriptionStore.create(payload || {}))));
ipcMain.handle('subs:remove', wrap(requireRole('admin', (_event, id) => subscriptionStore.remove(id))));
ipcMain.handle('subs:lookup', wrap(requireRole('user', (_event, code) => subscriptionStore.lookup(code))));

app.whenReady().then(() => {
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.botdome.control');
    }
    openLoginWindow();

    app.on('activate', () => {
        if (!loginWindow && !controlWindow) {
            openLoginWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
