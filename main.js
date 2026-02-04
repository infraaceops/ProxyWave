const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let robot;
try {
    robot = require('robotjs');
} catch (e) {
    console.warn('RobotJS not found. OS-level control will be disabled.');
}

function getMachineId() {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
                    // Create a short, readable hash of the MAC address
                    return crypto.createHash('sha256').update(iface.mac).digest('hex').substring(0, 10).toUpperCase();
                }
            }
        }
    } catch (err) {
        console.error("Failed to get MAC address:", err);
    }
    return os.hostname().substring(0, 10).toUpperCase();
}


function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Load our existing index.html
    win.loadFile('client/index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for Remote Control
ipcMain.on('remote-control:move-mouse', (event, { x, y }) => {
    if (!robot) return;
    const { width, height } = screen.getPrimaryDisplay().bounds;
    const targetX = x * width;
    const targetY = y * height;
    robot.moveMouse(targetX, targetY);
});

ipcMain.on('remote-control:click', (event, { x, y }) => {
    if (!robot) return;
    robot.mouseClick();
});

ipcMain.on('remote-control:type', (event, key) => {
    if (!robot) return;
    robot.keyTap(key);
});

ipcMain.handle('get-machine-info', () => {
    return {
        id: getMachineId(),
        username: os.userInfo().username || 'User',
        hostname: os.hostname()
    };
});

ipcMain.handle('get-screen-sources', async () => {
    return await desktopCapturer.getSources({ types: ['screen', 'window'] });
});
