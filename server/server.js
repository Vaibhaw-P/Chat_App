const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ✅ Allow only your Netlify frontend to access this backend
app.use(cors({
  origin: 'https://chatssssss.netlify.app',
  methods: ['GET', 'POST']
}));

// ✅ Serve static files from "public" (for local testing)
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Configure Socket.IO with CORS for Netlify
const io = new Server(server, {
  cors: {
    origin: 'https://chatssssss.netlify.app',
    methods: ['GET', 'POST']
  }
});

// 📄 Serve index.html on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🌐 In-memory state tracking
const users = {};
const usernames = new Set();
const rooms = new Map();

// ✨ Sanitize helper
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

// 🔌 Socket.io logic
io.on('connection', (socket) => {
  // Username check
  socket.on('check username', (username, cb) => {
    username = sanitize(username);
    cb(usernames.has(username) || !username);
  });

  // Join lobby
  socket.on('join lobby', (username) => {
    username = sanitize(username);
    users[socket.id] = { username, room: null };
    usernames.add(username);
    socket.emit('room list', Array.from(rooms.keys()));
  });

  // Create room
  socket.on('create room', (roomName, cb) => {
    roomName = sanitize(roomName);
    if (!roomName || rooms.has(roomName)) {
      cb(false, 'Room name taken or invalid.');
      return;
    }
    rooms.set(roomName, new Set());
    io.emit('room list', Array.from(rooms.keys()));
    cb(true);
  });

  // Join room
  socket.on('join room', (roomName, cb) => {
    roomName = sanitize(roomName);
    const user = users[socket.id];
    if (!user || !rooms.has(roomName)) {
      cb && cb(false, 'Room not found.');
      return;
    }

    // Leave current room if any
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

    // Join new room
    user.room = roomName;
    rooms.get(roomName).add(user.username);
    socket.join(roomName);
    cb && cb(true);
    socket.emit('joined room', roomName, Array.from(rooms.get(roomName)));
    io.to(roomName).emit('room users', Array.from(rooms.get(roomName)));
    io.to(roomName).emit('system message', {
      user: 'system',
      text: `${user.username} joined the room.`,
      time: Date.now()
    });
  });

  // Chat messages
  socket.on('chat message', ({ room, text }) => {
    const user = users[socket.id];
    if (!user || !room || !text) return;
    text = sanitize(text);
    io.to(room).emit('chat message', {
      user: user.username,
      text,
      time: Date.now()
    });

    // Notify others
    for (let [roomName, members] of rooms.entries()) {
      if (roomName !== room && members.has(user.username)) {
        io.to(roomName).emit('new message notification', room);
      }
    }
  });

  // Typing indicator
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

  // Disconnect cleanup
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

// 🚀 Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
