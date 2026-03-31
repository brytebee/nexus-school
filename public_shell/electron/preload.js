const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onQrPayload: (callback) => ipcRenderer.on('qr-payload', (_event, value) => callback(value)),
    onHandshakeComplete: (callback) => ipcRenderer.on('handshake-complete', (_event, value) => callback(value)),
    onSyncUpdate: (callback) => ipcRenderer.on('sync-update', (_event, value) => callback(value)),
    processCSV: (filePath) => ipcRenderer.send('process-csv', filePath),
    onCSVLoaded: (callback) => ipcRenderer.on('csv-loaded', (_event, value) => callback(value)),
    uiReady: () => ipcRenderer.send('ui-ready'),
    getIdentity: () => ipcRenderer.invoke('get-identity'),
    saveIdentity: (packet) => ipcRenderer.invoke('save-identity', packet),
    generateReports: (payload) => ipcRenderer.invoke('generate-reports', payload),
    resetAppData: () => ipcRenderer.invoke('reset-app-data'),
    onLicenseStatus: (callback) => ipcRenderer.on('license-status', (_event, value) => callback(value))
});
