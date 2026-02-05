const fs = require('fs');
fs.writeFileSync('started.txt', 'App started at ' + new Date());
const electron = require('electron');
fs.appendFileSync('started.txt', '\nElectron type: ' + typeof electron);
if (typeof electron === 'object' && electron.app) {
    fs.appendFileSync('started.txt', '\nApp is available');
} else {
    fs.appendFileSync('started.txt', '\nApp is NOT available');
}
const { app, BrowserWindow } = electron;
const path = require('path');
// ... rest of main.js simplified for testing
app.whenReady().then(() => {
    fs.appendFileSync('started.txt', '\nWhenReady called');
    const win = new BrowserWindow({ width: 800, height: 600 });
    win.loadFile('client/index.html');
});
