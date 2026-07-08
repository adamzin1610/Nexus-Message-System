const servers = ['http://localhost:3000', 'http://localhost:3001'];
let serverIndex = window.location.port === "3001" ? 1 : 0;
let socket = null;
let currentUser = null;
let currentServer = 'Not connected';

const usernameInput = document.getElementById('username');
const roleSelect = document.getElementById('role');
const joinBtn = document.getElementById('joinBtn');
const messageType = document.getElementById('messageType');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messages = document.getElementById('messages');
const users = document.getElementById('users');
const serverDisplay = document.getElementById('serverDisplay');
const connectionStatus = document.getElementById('connectionStatus');
const failoverText = document.getElementById('failoverText');
const statusDot = document.getElementById('statusDot');
const roleHint = document.getElementById('roleHint');
const clearBtn = document.getElementById('clearBtn');

function setConnectionState(isOnline, text) {
    connectionStatus.textContent = isOnline ? 'Connected' : 'Disconnected';
    failoverText.textContent = text;
    statusDot.classList.toggle('online', isOnline);
    serverDisplay.textContent = currentServer;
}

function connectToServer() {
    if (socket) {
        socket.removeAllListeners();
        socket.close();
    }

    const selectedServer = servers[serverIndex];
    currentServer = `Trying ${selectedServer}`;
    setConnectionState(false, 'Attempting connection or failover...');

    socket = io(selectedServer, {
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        timeout: 2000
    });

    socket.on('connect', () => {
        setConnectionState(true, `Connected using ${selectedServer}`);
        if (currentUser) {
            socket.emit('join', currentUser);
        }
    });

    socket.on('server info', (info) => {
        currentServer = `${info.serverName} | Port ${info.port}`;
        serverDisplay.textContent = currentServer;
    });

    socket.on('connect_error', () => {
        setConnectionState(false, `Cannot reach ${selectedServer}. Trying another server...`);
    });

    socket.on('reconnect_failed', () => {
        failoverToNextServer();
    });

    socket.on('disconnect', () => {
        setConnectionState(false, 'Server disconnected. Automatic reconnection is running...');
        setTimeout(failoverToNextServer, 2500);
    });

    socket.on('new message', addMessage);
    socket.on('users updated', renderUsers);
}

function failoverToNextServer() {
    serverIndex = (serverIndex + 1) % servers.length;
    connectToServer();
}

function addMessage(message) {
    const card = document.createElement('div');
    card.className = `message-card ${message.type}`;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.innerHTML = `<strong>${message.username} (${message.role})</strong><span>${message.server} • ${message.time}</span>`;

    const text = document.createElement('p');
    text.className = 'message-text';
    text.textContent = message.text;

    card.appendChild(meta);
    card.appendChild(text);
    messages.appendChild(card);
    messages.scrollTop = messages.scrollHeight;
}

function renderUsers(userList) {
    users.innerHTML = '';

    if (!userList.length) {
        users.innerHTML = '<p class="small-text">No users connected yet.</p>';
        return;
    }

    userList.forEach((user) => {
        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `<strong>${user.username}</strong><span>${user.role} • ${user.server}</span>`;
        users.appendChild(card);
    });
}

function updateRolePermission() {
    if (roleSelect.value === 'Student') {
        messageType.value = 'response';
        messageType.querySelector('option[value="announcement"]').disabled = true;
        roleHint.textContent = 'Student mode: you can receive announcements and send responses only.';
    } else {
        messageType.querySelector('option[value="announcement"]').disabled = false;
        roleHint.textContent = 'Lecturer mode: you can send announcements and responses.';
    }
}

joinBtn.onclick = () => {
    const username = usernameInput.value.trim();
    const role = roleSelect.value;

    if (!username) {
        alert('Please enter a username first.');
        return;
    }

    currentUser = { username, role };
    messageInput.disabled = false;
    sendBtn.disabled = false;
    usernameInput.disabled = true;
    roleSelect.disabled = true;
    joinBtn.disabled = true;

    updateRolePermission();
    connectToServer();
};

sendBtn.onclick = () => {
    const text = messageInput.value.trim();
    const type = messageType.value;

    if (!text) return;

    if (currentUser.role === 'Student' && type === 'announcement') {
        alert('Students can only send responses.');
        return;
    }

    socket.emit('send message', { text, type });
    messageInput.value = '';
};

messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendBtn.click();
});

roleSelect.onchange = updateRolePermission;
clearBtn.onclick = () => messages.innerHTML = '';

updateRolePermission();
setConnectionState(false, 'Enter username, select role, then join system.');
