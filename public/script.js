const socket = io();

// State
let myId = null;
let myName = localStorage.getItem('wifi-drop-name') || `Device-${Math.floor(Math.random() * 1000)}`;
let currentPeerId = null; // Who are we currently chatting with?
let chatHistory = {}; // { peerId: [ { type: 'sent'|'received', content: '...', isFile: bool } ] }
let peersMap = {}; // { id: { name, ip } }

// DOM Elements
const myNameInput = document.getElementById('my-name-input');
const peersListEl = document.getElementById('peers-list');
const radarView = document.getElementById('radar-view');
const chatView = document.getElementById('chat-view');

// Chat DOM
const chatPeerName = document.getElementById('chat-peer-name');
const chatAvatar = document.getElementById('chat-avatar');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const uploadProgress = document.getElementById('upload-progress-container');
const uploadFill = document.getElementById('upload-progress-fill');

// Modal Elements
const previewModal = document.getElementById('preview-modal');
const closeModalBtn = document.getElementById('close-modal');
const previewBody = document.getElementById('preview-body');
const previewFilename = document.getElementById('preview-filename');
const previewSize = document.getElementById('preview-size');
const downloadBtn = document.getElementById('download-btn');

// Initialization
myNameInput.value = myName;
socket.emit('join', { name: myName });

// Name Update Logic
myNameInput.addEventListener('change', (e) => {
    const newName = e.target.value.trim() || myName;
    if (newName !== myName) {
        myName = newName;
        localStorage.setItem('wifi-drop-name', myName);
        socket.emit('update-name', myName);
    }
});

// Theme Logic
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const body = document.body;
const savedTheme = localStorage.getItem('wifi-drop-theme');

// Default is Light. If 'dark' is saved, add class.
if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
    updateThemeIcon(false);
} else {
    updateThemeIcon(true);
}

themeToggle.onclick = () => {
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('wifi-drop-theme', isDark ? 'dark' : 'light');
    updateThemeIcon(!isDark);
};

function updateThemeIcon(isLight) {
    // Switch between Sun and Moon
    if (isLight) {
        // Sun (meaning we are in light mode, user can click to go dark)
        // Wait, icon usually shows what you WILL switch to.
        // If current is Light, show Moon.
        themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    } else {
        // Moon (meaning we are in dark mode, user can click to go light) -> Show Sun
        themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
    }
}

// Socket Events
socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected:', myId);
    // Re-join on connection/reconnection to ensure server knows us
    socket.emit('join', { name: myName });
});

socket.on('peer-list', (peers) => {
    updatePeersMap(peers);
    renderPeersList();
});

socket.on('signal', (data) => {
    handleSignal(data);
});

// Logic
function updatePeersMap(peersArray) {
    peersMap = {};
    peersArray.forEach(p => {
        if (p.id !== myId) {
            peersMap[p.id] = p;
        }
    });

    // If current peer left
    if (currentPeerId && !peersMap[currentPeerId]) {
        currentPeerId = null;
        showRadar();
    }
}

function renderPeersList() {
    peersListEl.innerHTML = '';
    const peerIds = Object.keys(peersMap);

    if (peerIds.length === 0) {
        peersListEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; padding:0.5rem;">No devices found.</div>';
    } else {
        peerIds.forEach(id => {
            const peer = peersMap[id];

            const el = document.createElement('div');
            el.className = `peer-item ${id === currentPeerId ? 'active' : ''}`;
            el.innerHTML = `
                <div class="avatar">${peer.name.charAt(0).toUpperCase()}</div>
                <div class="peer-info">
                    <div class="peer-name">${peer.name}</div>
                    <div class="peer-subtext">${peer.ip || 'Unknown IP'}</div>
                </div>
            `;
            el.onclick = () => selectPeer(id);
            peersListEl.appendChild(el);
        });
    }
}

function selectPeer(id) {
    if (currentPeerId === id) return;

    currentPeerId = id;
    renderPeersList(); // To update 'active' class
    showChat(peersMap[id]);
}

function showRadar() {
    radarView.classList.remove('hidden');
    chatView.classList.add('hidden');
}

function showChat(peer) {
    radarView.classList.add('hidden');
    chatView.classList.remove('hidden');

    chatPeerName.innerText = peer.name;
    chatAvatar.innerText = peer.name.charAt(0).toUpperCase();

    renderChatHistory(peer.id);
}

function renderChatHistory(peerId) {
    chatMessages.innerHTML = '';
    const history = chatHistory[peerId] || [];
    history.forEach(msg => {
        appendMessageToUI(msg);
    });
}

function addToHistory(peerId, msgObj) {
    if (!chatHistory[peerId]) chatHistory[peerId] = [];
    chatHistory[peerId].push(msgObj);
}

// Sending Messages
sendBtn.onclick = sendMessage;
messageInput.onkeypress = (e) => {
    if (e.key === 'Enter') sendMessage();
};

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentPeerId) return;

    const msgObj = { type: 'sent', content: text, isFile: false };

    // UI
    appendMessageToUI(msgObj);
    addToHistory(currentPeerId, msgObj);
    messageInput.value = '';

    // Socket
    socket.emit('signal', {
        to: currentPeerId,
        type: 'text',
        payload: { text }
    });
}

function handleSignal(data) {
    const fromId = data.from;
    const msgObj = {
        type: 'received',
        isFile: data.type === 'file-notify',
        content: data.type === 'text' ? data.payload.text : data.payload
    };

    addToHistory(fromId, msgObj);

    // Auto-Open Logic: If we are not already chatting with this person, switch to them
    if (currentPeerId !== fromId) {
        selectPeer(fromId);
    } else {
        appendMessageToUI(msgObj);
    }
}

function appendMessageToUI(msg) {
    const div = document.createElement('div');
    const typeClass = msg.type; // 'sent' or 'received'
    div.className = `message ${typeClass} ${msg.isFile ? 'file-msg' : ''}`;

    if (msg.isFile) {
        const fileInfo = msg.content; // { filename, originalName, size }
        div.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
            <div>
                <div style="font-weight:600">${fileInfo.originalName}</div>
                <div style="font-size:0.75rem; opacity:0.8">${formatSize(fileInfo.size)}</div>
            </div>
        `;
        // Open Preview on Click for BOTH sent and received files
        div.onclick = () => openPreview(fileInfo);
    } else {
        div.innerText = msg.content;
    }

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// File Upload
uploadBtn.onclick = () => fileInput.click();
fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file || !currentPeerId) return;

    const formData = new FormData();
    formData.append('file', file);

    uploadProgress.classList.remove('hidden');
    uploadFill.style.width = '0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload', true);

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const pct = (e.loaded / e.total) * 100;
            uploadFill.style.width = pct + '%';
        }
    };

    xhr.onload = () => {
        if (xhr.status === 200) {
            const result = JSON.parse(xhr.responseText);
            const payload = {
                filename: result.filename,
                originalName: result.originalname,
                size: result.size
            };

            socket.emit('signal', {
                to: currentPeerId,
                type: 'file-notify',
                payload: payload
            });

            const msgObj = { type: 'sent', content: payload, isFile: true };
            addToHistory(currentPeerId, msgObj);
            appendMessageToUI(msgObj);

            setTimeout(() => {
                uploadProgress.classList.add('hidden');
                uploadFill.style.width = '0%';
            }, 1000);
        } else {
            alert('Upload failed');
            uploadProgress.classList.add('hidden');
        }
    };

    xhr.send(formData);
    // Reset file input so same file can be selected again
    fileInput.value = '';
};


// Preview Modal Logic
function openPreview(fileInfo) {
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileInfo.originalName);

    previewBody.innerHTML = '';
    if (isImage) {
        const img = document.createElement('img');
        img.src = `/download/${fileInfo.filename}`; // Direct link to file
        img.className = 'preview-image';
        previewBody.appendChild(img);
    } else {
        const icon = document.createElement('div');
        icon.className = 'preview-icon';
        icon.innerText = '📄';
        previewBody.appendChild(icon);
    }

    previewFilename.innerText = fileInfo.originalName;
    previewSize.innerText = formatSize(fileInfo.size);

    downloadBtn.href = `/download/${fileInfo.filename}`;
    downloadBtn.setAttribute('download', fileInfo.originalName);

    previewModal.classList.remove('hidden');
}

closeModalBtn.onclick = () => {
    previewModal.classList.add('hidden');
};
// Close on outside click
previewModal.onclick = (e) => {
    if (e.target === previewModal) {
        previewModal.classList.add('hidden');
    }
};

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
