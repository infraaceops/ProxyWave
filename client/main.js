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

    // Handling Incoming Call (Guest Side)
    peer.on('call', (call) => {
        call.answer();
        call.on('stream', (remoteStream) => {
            videoElement.srcObject = remoteStream;
            document.getElementById('control-overlay').style.display = 'none';
            updateStatus('Connected & Receiving Stream');
            setupGuestInteraction();
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

    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always",
                frameRate: { ideal: 60, max: 60 }
            },
            audio: true
        });

        isHost = true;
        showMeetingScreen(peer.id);
        saveSession(peer.id, password, true);

        // Notify session for re-connection
        updateStatus('Waiting for guest...');

    } catch (err) {
        console.error("Failed to share screen:", err);
        alert("Screen sharing failed or cancelled.");
    }
}

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
                    peer.call(conn.peer, localStream);
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

document.getElementById('btn-toggle-chat').onclick = () => {
    chatPanel.classList.toggle('active-panel');
};

document.getElementById('close-chat').onclick = () => {
    chatPanel.classList.remove('active-panel');
};


