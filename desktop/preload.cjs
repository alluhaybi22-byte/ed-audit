const { contextBridge, ipcRenderer } = require('electron');

// Only a user-facing print/save-PDF operation crosses the renderer boundary.
contextBridge.exposeInMainWorld('edAuditDesktop', Object.freeze({
  printReport: language => ipcRenderer.invoke('audit:print-report', language),
}));
