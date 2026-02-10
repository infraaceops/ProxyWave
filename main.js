const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { execFile } = require('child_process');
const fs = require('fs');

const remoteControlPath = path.join(__dirname, 'RemoteControl.exe');

let robot;
try {
    robot = require('robotjs');
} catch (e) {
    if (!fs.existsSync(remoteControlPath)) {
        console.warn('RobotJS and C# helper missing. OS control disabled.');
    }
}

function runRemoteCommand(args) {
    if (fs.existsSync(remoteControlPath)) {
        execFile(remoteControlPath, args);
    }
}

function getMachineId() {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
                    return crypto.createHash('sha256').update(iface.mac).digest('hex').substring(0, 8).toUpperCase();
                }
            }
        }
    } catch (err) { }
    return os.hostname().substring(0, 8).toUpperCase();
}


function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        titleBarStyle: 'hidden',
        icon: path.join(__dirname, 'assets/icon.png'),
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
    const { width, height } = screen.getPrimaryDisplay().bounds;
    const targetX = Math.floor(x * width);
    const targetY = Math.floor(y * height);

    if (robot) {
        robot.moveMouse(targetX, targetY);
    } else {
        runRemoteCommand(['move', targetX.toString(), targetY.toString()]);
    }
});

ipcMain.on('remote-control:click', (event, { x, y }) => {
    if (robot) {
        robot.mouseClick();
    } else {
        runRemoteCommand(['click']);
    }
});

ipcMain.on('remote-control:type', (event, key) => {
    if (robot) {
        const robotKeys = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            'Enter': 'enter',
            'Backspace': 'backspace',
            'Escape': 'escape',
            'Tab': 'tab'
        };
        const mappedKey = robotKeys[key] || key.toLowerCase();
        try {
            robot.keyTap(mappedKey);
        } catch (e) {
            console.error('RobotJS keyTap error:', e);
        }
    } else {
        const sendKeysMap = {
            'ArrowUp': '{UP}',
            'ArrowDown': '{DOWN}',
            'ArrowLeft': '{LEFT}',
            'ArrowRight': '{RIGHT}',
            'Enter': '{ENTER}',
            'Backspace': '{BACKSPACE}',
            'Escape': '{ESC}',
            'Tab': '{TAB}'
        };
        const mappedKey = sendKeysMap[key] || key;
        runRemoteCommand(['type', mappedKey]);
    }
});

ipcMain.handle('get-machine-info', () => {
    return {
        id: getMachineId(),
        username: os.userInfo().username || 'User',
        hostname: os.hostname()
    };
});

ipcMain.handle('get-screen-sources', async () => {
    return await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 300, height: 200 } });
});

// Window Management
ipcMain.on('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize();
});

ipcMain.on('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
    }
});

ipcMain.on('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close();
});
