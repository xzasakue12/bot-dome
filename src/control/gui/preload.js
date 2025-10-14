const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('control', {
    startBot: () => invoke('pm2:start'),
    stopBot: () => invoke('pm2:stop'),
    restartBot: () => invoke('pm2:restart'),
    getStatus: () => invoke('pm2:status'),
    getLogs: (lines) => invoke('pm2:logs', lines)
});
