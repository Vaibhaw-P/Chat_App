let socket;
let username = '';
let currentRoom = '';
let rooms = {}; // fixed: object, not array
let usersInRoom = [];
let typingTimeout;
let isTyping = false;
let windowFocused = true;
let socketEventsBound = false;

// DOM elements
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

// --- Sanitization ---
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

// --- Login ---
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

  if (socket) socket.disconnect();

  socket = io('https://chat-app-i5e6.onrender.com', { transports: ['websocket'] });

  socket.emit('check username', value, isTaken => {
    if (isTaken) {
      loginError.textContent = 'Username already taken. Choose another.';
    } else {
      username = value;
      localStorage.setItem('username', username);

      loginSection.classList.add('hidden');
      chatApp.classList.remove('hidden');
      userInfo.textContent = username;
      setupSocketEvents();
      socket.emit('join lobby', username);

      const savedRoom = localStorage.getItem('room');
      if (savedRoom) {
        joinRoom(savedRoom);
      }
    }
  });
}

// --- Room Creation ---
createRoomBtn.addEventListener('click', createRoom);
newRoomInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') createRoom();
});

function createRoom() {
  const roomName = sanitizeInput(newRoomInput.value);
  if (!roomName) return;
  if (rooms[roomName]) {
    alert('Room already exists.');
    return;
  }

  socket.emit('create room', roomName, (success, msg) => {
    if (!success) alert(msg || 'Room creation failed.');
    else newRoomInput.value = '';
  });
}

function renderRooms() {
  roomsList.innerHTML = '';
  Object.keys(rooms).forEach(room => {
    const li = document.createElement('li');
    li.textContent = room;
    li.className = room === currentRoom ? 'active' : '';
    li.addEventListener('click', () => joinRoom(room));

    // Add delete button if current user is owner
    if (rooms[room] === username) {
      const delBtn = document.createElement('button');
      delBtn.textContent = '❌';
      delBtn.classList.add('delete-room-btn');
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete room "${room}"?`)) {
          socket.emit('delete room', room);
        }
      };
      li.appendChild(delBtn);
    }

    roomsList.appendChild(li);
  });
}

function joinRoom(room) {
  if (room === currentRoom) return;
  socket.emit('join room', room, (success, msg) => {
    if (!success) alert(msg || 'Could not join room.');
    else localStorage.setItem('room', room);
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
  const id = Date.now().toString() + Math.random().toString(36).slice(2);
  socket.emit('chat message', { room: currentRoom, text, id });
  messageInput.value = '';
  stopTyping();
}

function renderMessage({ user, text, time, id, system }) {
  const li = document.createElement('li');
  li.className = system ? 'system' : (user === username ? 'self' : 'other');
  if (id) li.dataset.id = id;

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
    msgText.innerHTML = formatMessageText(text);

    li.appendChild(header);
    li.appendChild(msgText);

    if (user === username) {
      const editBtn = document.createElement('button');
      editBtn.textContent = '✏️';
      editBtn.onclick = () => {
        const newText = prompt('Edit your message:', text);
        if (newText && newText.trim()) {
          socket.emit('edit message', {
            id,
            text: sanitizeInput(newText),
            room: currentRoom
          });
        }
      };

      const delBtn = document.createElement('button');
      delBtn.textContent = '❌';
      delBtn.onclick = () => {
        if (confirm('Delete this message?')) {
          socket.emit('delete message', { id, room: currentRoom });
        }
      };

      header.appendChild(editBtn);
      header.appendChild(delBtn);
    }
  }

  messagesList.appendChild(li);
  messagesList.scrollTop = messagesList.scrollHeight;
  if (!windowFocused && !system) showNotification(user, text);
}

function formatTime(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatMessageText(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

// --- Typing ---
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

// --- User List ---
function renderUserList(users) {
  const userListUl = document.getElementById('user-list-ul');
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

function showNotification(user, text) {
  if (Notification.permission === 'granted') {
    new Notification(`New message from ${user}`, { body: text });
  }
}

// --- Setup Socket Events ---
function setupSocketEvents() {
  if (socketEventsBound) return;
  socketEventsBound = true;

  socket.on('room list', r => {
    rooms = r;
    renderRooms();
  });

  socket.on('joined room', (room, users) => {
    currentRoom = room;
    currentRoomSpan.textContent = room;
    usersInRoom = users;
    messagesList.innerHTML = '';
    renderUserList(usersInRoom);
  });

  socket.on('room history', msgs => {
    messagesList.innerHTML = '';
    msgs.forEach(renderMessage);
  });

  socket.on('chat message', renderMessage);
  socket.on('system message', msg => renderMessage({ ...msg, system: true }));

  socket.on('edit message', ({ id, text }) => {
    const li = [...messagesList.children].find(m => m.dataset.id === id);
    if (li) {
      const msgText = li.querySelector('.message-text');
      if (msgText) msgText.innerHTML = formatMessageText(text);
    }
  });

  socket.on('delete message', ({ id }) => {
    const li = [...messagesList.children].find(m => m.dataset.id === id);
    if (li) li.remove();
  });

  socket.on('room users', renderUserList);

  socket.on('typing', user => {
    if (user !== username) {
      document.getElementById('typing-indicator').textContent = `${user} is typing...`;
    }
  });

  socket.on('stop typing', user => {
    if (user !== username) {
      document.getElementById('typing-indicator').textContent = '';
    }
  });

  socket.on('new message notification', room => {
    if (room !== currentRoom) {
      const li = [...roomsList.children].find(l => l.textContent.includes(room));
      if (li) li.style.fontWeight = 'bold';
    }
  });

  socket.on('disconnect', () => {
    // Try reconnect
    setTimeout(() => socket.connect(), 1000);
  });
}

window.addEventListener('focus', () => (windowFocused = true));
window.addEventListener('blur', () => {
  windowFocused = false;
  if (Notification.permission !== 'granted') Notification.requestPermission();
});

new MutationObserver(() => {
  messagesList.scrollTop = messagesList.scrollHeight;
}).observe(messagesList, { childList: true });

// --- Auto Login ---
window.addEventListener('load', () => {
  const savedUser = localStorage.getItem('username');
  if (savedUser) {
    usernameInput.value = savedUser;
    handleLogin();
  }
});
