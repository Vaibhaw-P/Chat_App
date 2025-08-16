const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: 'https://chatssssss.netlify.app',
  methods: ['GET', 'POST']
}));

app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
  cors: {
    origin: 'https://chatssssss.netlify.app',
    methods: ['GET', 'POST']
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const users = {};
const usernames = new Set();
const rooms = new Map();       // roomName -> Set(users)
const roomOwners = new Map();  // roomName -> owner username
const messageStore = new Map(); // messageID -> message
const roomMessages = new Map(); // roomName -> [messages]

function sanitize(str) {
  return String(str).trim().replace(/[<>&"'`]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
  }[c]));
}

function emitRoomList() {
  io.emit('room list', Object.fromEntries(
    Array.from(rooms.keys()).map(r => [r, roomOwners.get(r)])
  ));
}

io.on('connection', (socket) => {

  socket.on('check username', (username, cb) => {
    username = sanitize(username);
    cb(usernames.has(username) || !username);
  });

  socket.on('join lobby', (username) => {
    username = sanitize(username);
    users[socket.id] = { username, room: null };
    usernames.add(username);
    emitRoomList();
  });

  socket.on('create room', (roomName, cb) => {
    roomName = sanitize(roomName);
    if (!roomName || rooms.has(roomName)) {
      cb(false, 'Room name taken or invalid.');
      return;
    }
    rooms.set(roomName, new Set());
    roomOwners.set(roomName, users[socket.id]?.username);
    roomMessages.set(roomName, []);
    emitRoomList();
    cb(true);
  });

  socket.on('join room', (roomName, cb) => {
    roomName = sanitize(roomName);
    const user = users[socket.id];
    if (!user || !rooms.has(roomName)) {
      cb && cb(false, 'Room not found.');
      return;
    }

    if (user.room && rooms.has(user.room)) {
      rooms.get(user.room).delete(user.username);
      io.to(user.room).emit('room users', Array.from(rooms.get(user.room)));
      io.to(user.room).emit('system message', {
        user: 'system',
        text: `${user.username} left the room.`,
        time: Date.now()
      });
      socket.leave(user.room);
    }

    user.room = roomName;
    rooms.get(roomName).add(user.username);
    socket.join(roomName);
    cb && cb(true);

    // Send chat history
    socket.emit('room history', roomMessages.get(roomName) || []);

    socket.emit('joined room', roomName, Array.from(rooms.get(roomName)));
    io.to(roomName).emit('room users', Array.from(rooms.get(roomName)));
    io.to(roomName).emit('system message', {
      user: 'system',
      text: `${user.username} joined the room.`,
      time: Date.now()
    });
  });

  socket.on('chat message', ({ room, text, id }) => {
    const user = users[socket.id];
    if (!user || !room || !text) return;
    text = sanitize(text);

    const message = {
      user: user.username,
      text,
      time: Date.now(),
      id,
      room
    };

    messageStore.set(id, message);
    if (!roomMessages.has(room)) roomMessages.set(room, []);
    roomMessages.get(room).push(message);

    io.to(room).emit('chat message', message);

    for (let [roomName, members] of rooms.entries()) {
      if (roomName !== room && members.has(user.username)) {
        io.to(roomName).emit('new message notification', room);
      }
    }
  });

  socket.on('edit message', ({ id, text, room }) => {
    const user = users[socket.id];
    if (!user || !id || !text || !room) return;
    text = sanitize(text);

    const message = messageStore.get(id);
    if (message && message.user === user.username && message.room === room) {
      message.text = text;
      io.to(room).emit('edit message', { id, text });
    }
  });

  socket.on('delete message', ({ id, room }) => {
    const user = users[socket.id];
    if (!user || !id || !room) return;

    const message = messageStore.get(id);
    if (message && message.user === user.username && message.room === room) {
      messageStore.delete(id);
      if (roomMessages.has(room)) {
        roomMessages.set(room, roomMessages.get(room).filter(m => m.id !== id));
      }
      io.to(room).emit('delete message', { id });
    }
  });

  socket.on('delete room', (roomName) => {
    roomName = sanitize(roomName);
    const user = users[socket.id];
    if (!user || !rooms.has(roomName)) return;

    const owner = roomOwners.get(roomName);
    if (owner !== user.username) return;

    io.to(roomName).emit('system message', {
      user: 'system',
      text: `Room "${roomName}" has been deleted.`,
      time: Date.now()
    });

    rooms.delete(roomName);
    roomOwners.delete(roomName);
    roomMessages.delete(roomName);

    io.in(roomName).socketsLeave(roomName);

    emitRoomList();
  });

  socket.on('typing', (room) => {
    const user = users[socket.id];
    if (user && room) {
      socket.to(room).emit('typing', user.username);
    }
  });

  socket.on('stop typing', (room) => {
    const user = users[socket.id];
    if (user && room) {
      socket.to(room).emit('stop typing', user.username);
    }
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      usernames.delete(user.username);
      if (user.room && rooms.has(user.room)) {
        rooms.get(user.room).delete(user.username);
        io.to(user.room).emit('room users', Array.from(rooms.get(user.room)));
        io.to(user.room).emit('system message', {
          user: 'system',
          text: `${user.username} disconnected.`,
          time: Date.now()
        });
      }
      delete users[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
