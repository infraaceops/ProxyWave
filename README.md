# ProxyWave 🌊

High-performance Remote Desktop & Screen Sharing built with Electron and PeerJS.

## 🚀 Features
- **Low-latency Streaming**: Powered by WebRTC (PeerJS).
- **Control**: Remote mouse, keyboard, and click events.
- **Privacy**: Password-protected sessions.
- **Premium UI**: Sleek glassmorphism design with custom window controls.

## 🛠️ Development
```bash
npm install
npm start
```

## 📦 Building for Release

### Windows
```bash
npm run build:win
```
*Note: Includes a zero-dependency C# helper for remote control.*

### macOS
```bash
npm run build:mac
```
*Requirement: Building for Mac requires a macOS environment.*

### Linux
```bash
npm run build:linux
```

## ⚠️ Notes
- If `robotjs` fails to compile, the app uses a native C# fallback on Windows.
- For Mac/Linux, ensure you have the necessary build tools (`make`, `g++`) if you wish to re-enable OS-level control via `robotjs`.
