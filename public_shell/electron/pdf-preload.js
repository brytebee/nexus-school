const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusPDF', {
    onPrintData: (callback) => ipcRenderer.on('print-data', (_event, value) => callback(value)),
    ready: () => ipcRenderer.send('pdf-renderer-ready')
});
