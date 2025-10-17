const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args);
}

function on(channel, listener) {
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('control', {
    startBot: () => invoke('pm2:start'),
    stopBot: () => invoke('pm2:stop'),
    restartBot: () => invoke('pm2:restart'),
    getStatus: () => invoke('pm2:status'),
    getLogs: (lines) => invoke('pm2:logs', lines)
});

contextBridge.exposeInMainWorld('auth', {
    login: (token) => invoke('auth:login', token),
    getRole: () => invoke('auth:get-role'),
    logout: () => invoke('auth:logout'),
    onRoleChange: (handler) => on('auth:role', (_, role) => handler(role ?? null))
});

contextBridge.exposeInMainWorld('env', {
    get: (key) => invoke('env:get', key)
});

contextBridge.exposeInMainWorld('subscriptions', {
    list: () => invoke('subs:list'),
    create: (payload) => invoke('subs:create', payload),
    remove: (id) => invoke('subs:remove', id),
    lookup: (code) => invoke('subs:lookup', code)
});
