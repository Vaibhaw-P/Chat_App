// Note: This code assumes you have a Socket.io server running and serving this client.

let socket;
let username = '';
let currentRoom = '';
let rooms = [];
let usersInRoom = [];
let typingTimeout;
let isTyping = false;
let windowFocused = true;

// DOM Elements
const loginSection = document.getElementById('login-section');
const chatApp = document.getElementById('chat-app');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const roomsList = document.getElementById('rooms');
const newRoomInput = document.getElementById('new-room-input');
const createRoomBtn = document.getElementById('create-room-btn');
const currentRoomSpan = document.getElementById('current-room');
const userInfo = document.getElementById('user-info');
const messagesList = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

// User list sidebar
let userListSidebar = document.getElementById('user-list');
if (!userListSidebar) {
    userListSidebar = document.createElement('div');
    userListSidebar.id = 'user-list';
    userListSidebar.style.padding = '1rem';
    userListSidebar.style.background = '#f7f7fa';
    userListSidebar.style.borderLeft = '1px solid #e0e0e0';
    userListSidebar.style.minWidth = '150px';
    userListSidebar.style.maxWidth = '200px';
    userListSidebar.style.overflowY = 'auto';
    userListSidebar.innerHTML = `<h4>Users</h4><ul id="user-list-ul" style="list-style:none;padding:0;margin:0;"></ul><div id="typing-indicator" style="color:#888;font-size:0.95em;margin-top:0.5em;"></div>`;
    const chatRoom = document.getElementById('chat-room');
    chatRoom.parentNode.insertBefore(userListSidebar, chatRoom.nextSibling);
}
const userListUl = document.getElementById('user-list-ul');
const typingIndicator = document.getElementById('typing-indicator');

// --- Input Sanitization Utilities ---
function sanitizeInput(str) {
    return String(str)
        .trim()
        .replace(/[<>&"'`]/g, c => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;',
            '`': '&#96;'
        }[c]));
}

// --- Username Login ---
loginBtn.addEventListener('click', handleLogin);
usernameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
});

function handleLogin() {
    const value = sanitizeInput(usernameInput.value);
    if (!value) {
        loginError.textContent = 'Username cannot be empty.';
        return;
    }
    socket = io('https://chat-app-399x.onrender.com');
    socket.emit('check username', value, (isTaken) => {
        if (isTaken) {
            loginError.textContent = 'Username already taken. Choose another.';
        } else {
            username = value;
            loginSection.classList.add('hidden');
            chatApp.classList.remove('hidden');
            userInfo.textContent = username;
            setupSocketEvents();
            socket.emit('join lobby', username);
        }
    });
}

// --- Room Management ---
createRoomBtn.addEventListener('click', createRoom);
newRoomInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') createRoom();
});

function createRoom() {
    const roomName = sanitizeInput(newRoomInput.value);
    if (!roomName) return;
    // Prevent duplicate room names (client-side check)
    if (rooms.includes(roomName)) {
        alert('Room name already exists.');
        return;
    }
    socket.emit('create room', roomName, (success, msg) => {
        if (!success) {
            alert(msg || 'Room creation failed.');
        } else {
            newRoomInput.value = '';
        }
    });
}

function renderRooms() {
    roomsList.innerHTML = '';
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.textContent = room;
        li.className = room === currentRoom ? 'active' : '';
        li.addEventListener('click', () => joinRoom(room));
        roomsList.appendChild(li);
    });
}

function joinRoom(room) {
    if (room === currentRoom) return;
    socket.emit('join room', room, (success, msg) => {
        if (!success) {
            alert(msg || 'Could not join room.');
        }
    });
}

// --- Messaging ---
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
    else handleTyping();
});

function sendMessage() {
    const text = sanitizeInput(messageInput.value);
    if (!text || !currentRoom) return;
    socket.emit('chat message', { room: currentRoom, text });
    messageInput.value = '';
    stopTyping();
}

function renderMessage({ user, text, time, system }) {
    const li = document.createElement('li');
    li.className = system ? 'system' : (user === username ? 'self' : 'other');

    if (system) {
        li.textContent = text;
    } else {
        const header = document.createElement('div');
        header.className = 'message-header';
        const userSpan = document.createElement('span');
        userSpan.className = 'username';
        userSpan.textContent = user;
        const timeSpan = document.createElement('span');
        timeSpan.className = 'timestamp';
        timeSpan.textContent = ` ${formatTime(time)}`;
        header.appendChild(userSpan);
        header.appendChild(timeSpan);

        const msgText = document.createElement('div');
        msgText.className = 'message-text';
        msgText.innerHTML = formatMessageText(sanitizeInput(text));

        li.appendChild(header);
        li.appendChild(msgText);
    }
    messagesList.appendChild(li);
    messagesList.scrollTop = messagesList.scrollHeight;
    if (!windowFocused && !system) {
        showNotification(user, text);
    }
}

// Format time as HH:MM
function formatTime(ts) {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Allow **bold**, *italic*, and links
function formatMessageText(text) {
    let formatted = text
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return formatted;
}

// --- Typing Indicator ---
function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing', currentRoom);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 1200);
}

function stopTyping() {
    if (isTyping) {
        isTyping = false;
        socket.emit('stop typing', currentRoom);
    }
}

// --- Render User List ---
function renderUserList(users) {
    userListUl.innerHTML = '';
    users.forEach(u => {
        const li = document.createElement('li');
        li.textContent = u;
        if (u === username) {
            li.style.fontWeight = 'bold';
            li.style.color = '#4f8cff';
        }
        userListUl.appendChild(li);
    });
}

// --- Notifications ---
function showNotification(user, text) {
    if (Notification.permission === "granted") {
        new Notification(`New message from ${user}`, { body: text });
    }
}

// --- Socket.io Events ---
function setupSocketEvents() {
    socket.on('room list', (roomArr) => {
        rooms = roomArr;
        renderRooms();
    });

    socket.on('joined room', (room, users) => {
        currentRoom = room;
        currentRoomSpan.textContent = room;
        usersInRoom = users;
        messagesList.innerHTML = '';
        renderUserList(usersInRoom);
    });

    socket.on('chat message', (msg) => {
        renderMessage(msg);
    });

    socket.on('system message', (msg) => {
        renderMessage({ ...msg, system: true });
    });

    socket.on('room users', (users) => {
        usersInRoom = users;
        renderUserList(usersInRoom);
    });

    socket.on('typing', (user) => {
        if (user !== username) {
            typingIndicator.textContent = `${user} is typing...`;
        }
    });

    socket.on('stop typing', (user) => {
        if (user !== username) {
            typingIndicator.textContent = '';
        }
    });

    socket.on('new message notification', (room) => {
        if (room !== currentRoom) {
            const li = Array.from(roomsList.children).find(li => li.textContent === room);
            if (li) li.style.fontWeight = 'bold';
        }
    });

    socket.on('disconnect', () => {
        loginSection.classList.remove('hidden');
        chatApp.classList.add('hidden');
        loginError.textContent = 'Disconnected from server. Please refresh to reconnect.';
        userListUl.innerHTML = '';
        messagesList.innerHTML = '';
        roomsList.innerHTML = '';
        currentRoomSpan.textContent = 'Select a room';
        userInfo.textContent = '';
    });
}

// --- Window Focus/Blur for Notifications ---
window.addEventListener('focus', () => {
    windowFocused = true;
});
window.addEventListener('blur', () => {
    windowFocused = false;
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }
});

// --- Utility: Auto-scroll on new messages ---
messagesList.addEventListener('DOMNodeInserted', () => {
    messagesList.scrollTop = messagesList.scrollHeight;
});