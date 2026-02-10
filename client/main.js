let peer = null;
let currentRoom = null;
let localStream = null;
let conn = null; // Data connection for controls
let isHost = false;
let hostPassword = '';
let systemUsername = 'User';
let machineId = null;

async function initialize() {
    if (window.electronAPI && window.electronAPI.getMachineInfo) {
        const info = await window.electronAPI.getMachineInfo();
        systemUsername = info.username;
        machineId = info.id;
    }

    peer = new Peer(machineId, {
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    });

    setupPeerListeners();
}

function setupPeerListeners() {
    peer.on('open', (id) => {
        statusText.innerText = `Hi ${systemUsername}, Ready. ID: ${id}`;
        statusText.style.color = '#34c759';
        autoReconnect();
    });

    peer.on('disconnected', () => {
        updateStatus('Peer disconnected. Reconnecting...');
        peer.reconnect();
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        statusText.innerText = `Error: ${err.type}`;
        statusText.style.color = '#ff3b30';

        if (err.type === 'network' || err.type === 'server-error') {
            setTimeout(() => peer.reconnect(), 5000);
        }
    });

    // Handling Incoming Connection (Host Side)
    peer.on('connection', (connection) => {
        conn = connection;
        setupDataListeners();
        updateStatus('Client connected, authenticating...');
    });

    peer.on('call', async (call) => {
        let streamToProvide = null;
        try {
            // Try to get mic for bidirectional audio
            streamToProvide = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamToProvide.getAudioTracks().forEach(t => t.enabled = false); // Start muted
            document.getElementById('btn-toggle-mic').classList.add('muted');
        } catch (e) {
            console.warn("Guest mic access denied or not available", e);
        }

        call.answer(streamToProvide);

        call.on('stream', (remoteStream) => {
            videoElement.srcObject = remoteStream;
            document.getElementById('control-overlay').style.display = 'none';
            updateStatus('Receiving Stream');
            setupGuestInteraction();
            if (streamToProvide) localStream = streamToProvide; // Store for toggle
        });

        call.on('close', () => {
            updateStatus('Stream Closed');
            videoElement.srcObject = null;
        });
    });
}


// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const meetingScreen = document.getElementById('meeting-screen');
const hostTab = document.getElementById('tab-host');
const joinTab = document.getElementById('tab-join');
const hostPanel = document.getElementById('host-panel');
const joinPanel = document.getElementById('join-panel');
const statusText = document.getElementById('setup-status');
const videoElement = document.getElementById('remote-video');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const msgInput = document.getElementById('msg-input');

// --- Navigation Logic ---
hostTab.onclick = () => {
    hostTab.classList.add('active');
    joinTab.classList.remove('active');
    hostPanel.classList.add('active');
    joinPanel.classList.remove('active');
};

joinTab.onclick = () => {
    joinTab.classList.add('active');
    hostTab.classList.remove('active');
    joinPanel.classList.add('active');
    hostPanel.classList.remove('active');
};

// Initialize everything
initialize();

// --- Core Functionality ---

async function startHost() {
    const password = document.getElementById('host-password').value;
    if (!password) return alert('Please set a password');
    hostPassword = password;

    if (window.electronAPI) {
        showScreenSelector();
    } else {
        // Fallback for browser (though this app is designed for Electron)
        try {
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" },
                audio: true
            });
            completeHostSetup();
        } catch (err) {
            console.error("Failed to share screen:", err);
        }
    }
}

async function showScreenSelector() {
    const modal = document.getElementById('screen-modal');
    const list = document.getElementById('sources-list');
    modal.classList.add('active');
    list.innerHTML = '<div class="loading-sources">Loading screens...</div>';

    try {
        const sources = await window.electronAPI.getScreenSources();
        list.innerHTML = '';

        sources.forEach(source => {
            const item = document.createElement('div');
            item.className = 'source-item';
            item.innerHTML = `
                <img src="${source.thumbnail.toDataURL()}" alt="${source.name}">
                <span>${source.name}</span>
            `;
            item.onclick = () => selectSource(source.id);
            list.appendChild(item);
        });
    } catch (err) {
        console.error("Error fetching sources:", err);
        list.innerHTML = '<div class="error">Failed to load screens.</div>';
    }
}

async function selectSource(sourceId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    minWidth: 1280,
                    maxWidth: 1920,
                    minHeight: 720,
                    maxHeight: 1080
                }
            }
        });

        // Combine with Microphone for "Talking"
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioStream.getAudioTracks().forEach(track => {
                track.enabled = false; // Start muted by default
                stream.addTrack(track);
            });
            document.getElementById('btn-toggle-mic').classList.add('muted');
        } catch (e) {
            console.warn("Microphone not available:", e);
        }

        localStream = stream;
        document.getElementById('screen-modal').classList.remove('active');
        completeHostSetup();
    } catch (err) {
        console.error("Error selecting source:", err);
        alert("Could not share selected screen.");
    }
}

function completeHostSetup() {
    isHost = true;
    showMeetingScreen(peer.id);
    saveSession(peer.id, hostPassword, true);
    updateStatus('Waiting for guest...');
}

document.getElementById('cancel-share').onclick = () => {
    document.getElementById('screen-modal').classList.remove('active');
};

function joinSession() {
    const roomId = document.getElementById('room-id').value;
    const password = document.getElementById('join-password').value;

    if (!roomId) return alert('Session ID is required');

    conn = peer.connect(roomId);

    conn.on('open', () => {
        conn.send({ type: 'auth', password: password });
    });

    setupDataListeners();
}

function setupDataListeners() {
    if (!conn) return;

    conn.on('data', (data) => {
        switch (data.type) {
            case 'auth':
                if (data.password === hostPassword) {
                    conn.send({ type: 'auth-success' });
                    const call = peer.call(conn.peer, localStream);
                    call.on('stream', (guestStream) => {
                        // Host receiving Guest's audio
                        const audio = document.createElement('audio');
                        audio.srcObject = guestStream;
                        audio.autoplay = true;
                        document.body.appendChild(audio);
                    });
                    updateStatus('Guest Authenticated');
                } else {
                    conn.send({ type: 'auth-fail' });
                }
                break;

            case 'auth-success':
                isHost = false;
                showMeetingScreen(conn.peer);
                saveSession(conn.peer, document.getElementById('join-password').value, false);
                break;

            case 'auth-fail':
                alert('Incorrect password');
                conn.close();
                break;

            case 'chat':
                appendChatMessage(data.sender, data.text);
                break;

            case 'mouse-move':
                if (isHost) {
                    renderRemoteCursor(data.x, data.y);
                    if (window.electronAPI) window.electronAPI.moveMouse(data.x, data.y);
                }
                break;

            case 'mouse-click':
                if (isHost) {
                    showClickRipple(data.x, data.y);
                    if (window.electronAPI) window.electronAPI.click(data.x, data.y);
                }
                break;

            case 'keyboard-key':
                if (isHost && window.electronAPI) {
                    window.electronAPI.type(data.key);
                }
                break;
        }
    });

    conn.on('close', () => {
        updateStatus('Partner Disconnected');
        // Wait for rejoin logic
        setTimeout(() => {
            if (conn.disconnected) {
                updateStatus('Waiting for partner to rejoin...');
            }
        }, 2000);
    });
}

// --- Interaction Logic (Guest Side) ---

function setupGuestInteraction() {
    if (isHost) return;

    videoElement.onmousemove = (e) => {
        if (!conn || !conn.open) return;
        const rect = videoElement.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        conn.send({ type: 'mouse-move', x, y });
    };

    videoElement.onclick = (e) => {
        if (!conn || !conn.open) return;
        const rect = videoElement.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        conn.send({ type: 'mouse-click', x, y });
    };

    window.onkeydown = (e) => {
        if (!conn || !conn.open || isHost) return;
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

        // Prevent default for system-level keys to allow remote control
        if (e.key.length === 1 || ['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            conn.send({ type: 'keyboard-key', key: e.key });
        }
    };
}

// --- Visual Feedback (Host Side) ---

function renderRemoteCursor(x, y) {
    let cursor = document.getElementById('remote-cursor');
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'remote-cursor';
        cursor.innerHTML = '📍';
        cursor.style.position = 'absolute';
        cursor.style.pointerEvents = 'none';
        cursor.style.zIndex = '1000';
        cursor.style.transition = 'all 0.1s linear';
        document.getElementById('cursor-layer').appendChild(cursor);
    }
    const container = document.getElementById('cursor-layer');
    cursor.style.left = `${x * 100}%`;
    cursor.style.top = `${y * 100}%`;
}

function showClickRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = `${x * 100}%`;
    ripple.style.top = `${y * 100}%`;
    document.getElementById('cursor-layer').appendChild(ripple);
    setTimeout(() => ripple.remove(), 1000);
}

// --- Chat Logic ---

function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !conn || !conn.open) return;

    const msg = { type: 'chat', sender: systemUsername, text: text };
    conn.send(msg);
    appendChatMessage('You', text);
    msgInput.value = '';
}

function appendChatMessage(sender, text) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<b>${sender}:</b> ${text}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- Utils ---

function showMeetingScreen(roomId) {
    setupScreen.classList.remove('active');
    meetingScreen.classList.add('active');
    document.getElementById('display-room-id').innerText = roomId;
}

function saveSession(id, pwd, asHost) {
    localStorage.setItem('proxywave_last_session', JSON.stringify({ id, pwd, asHost }));
}

function autoReconnect() {
    const lastSession = localStorage.getItem('proxywave_last_session');
    if (lastSession) {
        const { id, pwd, asHost } = JSON.parse(lastSession);
        if (asHost) {
            document.getElementById('host-password').value = pwd;
            // Optionally auto-start
        } else {
            document.getElementById('room-id').value = id;
            document.getElementById('join-password').value = pwd;
        }
    }
}

function updateStatus(text) {
    document.getElementById('connection-status').innerText = text;
}

// Attach listeners
document.getElementById('start-host-btn').onclick = startHost;
document.getElementById('join-btn').onclick = joinSession;
document.getElementById('btn-leave').onclick = () => {
    localStorage.removeItem('proxywave_last_session');
    window.location.reload();
};
document.getElementById('send-btn').onclick = sendMessage;
msgInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

document.getElementById('btn-toggle-mic').onclick = () => {
    const btn = document.getElementById('btn-toggle-mic');
    const isMutedNow = btn.classList.toggle('muted');

    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            audioTracks.forEach(track => track.enabled = !isMutedNow);
        } else if (!isMutedNow) {
            // Try to capture on the fly if not already present
            navigator.mediaDevices.getUserMedia({ audio: true }).then(micStream => {
                micStream.getAudioTracks().forEach(track => localStream.addTrack(track));
            }).catch(err => {
                console.error("Delayed mic access failed:", err);
                btn.classList.add('muted');
            });
        }
    }
};

document.getElementById('btn-toggle-chat').onclick = () => {
    chatPanel.classList.toggle('active-panel');
};

document.getElementById('close-chat').onclick = () => {
    chatPanel.classList.remove('active-panel');
};

document.getElementById('copy-id-btn').onclick = () => {
    const id = document.getElementById('display-room-id').innerText;
    navigator.clipboard.writeText(id).then(() => {
        const btn = document.getElementById('copy-id-btn');
        const originalText = btn.innerText;
        btn.innerText = '✅';
        setTimeout(() => btn.innerText = originalText, 2000);
    });
};

// Window Controls
const attachWinEvents = (prefix = '') => {
    const min = document.getElementById(prefix + 'win-min');
    const max = document.getElementById(prefix + 'win-max');
    const close = document.getElementById(prefix + 'win-close');

    if (min) min.onclick = () => window.electronAPI.minimizeWindow();
    if (max) max.onclick = () => window.electronAPI.maximizeWindow();
    if (close) close.onclick = () => window.electronAPI.closeWindow();
};

attachWinEvents();      // Landing Screen
attachWinEvents('m-');  // Meeting Screen


