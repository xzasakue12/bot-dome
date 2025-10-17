const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('session', {
    onRoleChange: (handler) => {
        ipcRenderer.on('auth:role', (_, role) => handler(role));
    }
});
