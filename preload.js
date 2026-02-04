const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    moveMouse: (x, y) => ipcRenderer.send('remote-control:move-mouse', { x, y }),
    click: (x, y) => ipcRenderer.send('remote-control:click', { x, y }),
    type: (key) => ipcRenderer.send('remote-control:type', key),
    getMachineInfo: () => ipcRenderer.invoke('get-machine-info'),
    getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
    isElectron: true
});
