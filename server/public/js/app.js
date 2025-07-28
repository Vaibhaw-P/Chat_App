// Chat Application JavaScript Code
let socket;
let username = '';
let userDP = '';
let currentRoom = '';
let typingTimeout;
let isTyping = false;
let emojiPicker;
let socketEventsBound = false;

// DOM Elements
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesList = document.getElementById('messages');
const currentRoomSpan = document.getElementById('current-room');
const userInfo = document.getElementById('user-info');
const fileUpload = document.getElementById('file-upload');
const roomList = document.getElementById('room-info');
const createRoomBtn = document.getElementById('create-room-btn');
const newRoomInput = document.getElementById('new-room-input');
const userList = document.getElementById('user-list');
const typingIndicator = document.getElementById('typing-indicator');
const emojiBtn = document.getElementById('emoji-btn');

// Prompt for username and DP
(async function init() {
  username = prompt('Enter your username');
  while (!username || username.trim().length === 0) username = prompt('Username required');

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (file) userDP = await uploadToCloudinary(file);
    connectSocket();
  };
})();

function connectSocket() {
  socket = io('https://chat-app-i5e6.onrender.com', {
    transports: ['websocket']
  });

  socket.emit('check username', username, (isTaken) => {
    if (isTaken) return alert('Username taken. Refresh and choose another.');
    userInfo.textContent = username;
    socket.emit('join lobby', { username, dp: userDP });
    setupSocketEvents();
  });
}

function setupSocketEvents() {
  if (socketEventsBound) return;
  socketEventsBound = true;

  socket.on('room list', (rooms) => {
    roomList.innerHTML = '';
    rooms.forEach(room => {
      const div = document.createElement('div');
      div.textContent = room;
      div.className = 'cursor-pointer px-3 py-2 rounded bg-white hover:bg-blue-100';
      div.onclick = () => joinRoom(room);
      roomList.appendChild(div);
    });
  });

  socket.on('joined room', (room, users) => {
    currentRoom = room;
    currentRoomSpan.textContent = room;
    messagesList.innerHTML = '';
    renderUserList(users);
  });

  socket.on('chat message', renderMessage);

  socket.on('room users', renderUserList);

  socket.on('typing', user => {
    typingIndicator.textContent = `${user} is typing...`;
  });

  socket.on('stop typing', user => {
    typingIndicator.textContent = '';
  });

  socket.on('disconnect', () => {
    alert('Disconnected. Refresh to reconnect.');
  });
}

function joinRoom(room) {
  if (room === currentRoom) return;
  socket.emit('join room', room, (success, msg) => {
    if (!success) alert(msg || 'Failed to join room');
  });
}

function renderUserList(users) {
  userList.innerHTML = '';
  users.forEach(u => {
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2';
    div.innerHTML = `<img src="${u.dp}" class="w-8 h-8 rounded-full" /> <span>${u.username}</span>`;
    userList.appendChild(div);
  });
}

function renderMessage({ user, text, time, dp }) {
  const li = document.createElement('li');
  li.className = 'group flex gap-3 items-start';
  li.innerHTML = `
    <img src="${dp}" class="w-10 h-10 rounded-full mt-1" />
    <div class="relative bg-white p-3 rounded shadow max-w-[70%]">
      <div class="font-bold text-sm mb-1">${user}</div>
      <div>${formatMessageText(text)}</div>
      <div class="text-xs text-gray-400 mt-1">${formatTime(time)}</div>
      <div class="absolute hidden group-hover:flex gap-2 top-1 right-1">
        <button class="text-sm hover:text-blue-500"><i class="fas fa-reply"></i></button>
        <button class="text-sm hover:text-green-500"><i class="fas fa-thumbtack"></i></button>
        <button class="text-sm hover:text-yellow-500"><i class="fas fa-share"></i></button>
        <button class="text-sm hover:text-blue-700"><i class="fas fa-edit"></i></button>
        <button class="text-sm hover:text-red-500"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `;
  messagesList.appendChild(li);
  messagesList.scrollTop = messagesList.scrollHeight;
}

function formatMessageText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" class="text-blue-500 underline" target="_blank">$1</a>');
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ========== EVENTS ==========
sendBtn.onclick = sendMessage;
messageInput.onkeydown = (e) => {
  if (e.key === 'Enter') sendMessage();
  else handleTyping();
};

createRoomBtn.onclick = () => {
  const name = newRoomInput.value.trim();
  if (!name) return;
  socket.emit('create room', name, (success, msg) => {
    if (!success) alert(msg || 'Failed');
    else newRoomInput.value = '';
  });
};

fileUpload.onchange = async () => {
  const file = fileUpload.files[0];
  if (!file) return;
  const url = await uploadToCloudinary(file);
  socket.emit('chat message', { room: currentRoom, text: url, dp: userDP, time: Date.now(), user: username });
};

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit('chat message', { room: currentRoom, text, dp: userDP, time: Date.now(), user: username });
  messageInput.value = '';
  stopTyping();
}

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

// ========== Emoji Picker ==========
emojiPicker = new EmojiButton();
emojiPicker.on('emoji', emoji => {
  messageInput.value += emoji;
  messageInput.focus();
});
emojiBtn.addEventListener('click', () => emojiPicker.togglePicker(emojiBtn));

// ========== Cloudinary Upload ==========
async function uploadToCloudinary(file) {
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', 'chat_upload'); // your unsigned preset name
  const res = await fetch('https://api.cloudinary.com/v1_1/dqvbf17ij/auto/upload', {
    method: 'POST',
    body: form
  });
  const data = await res.json();
  return data.secure_url;
}
