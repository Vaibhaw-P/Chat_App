
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const users = {};         // socket.id => { username, dp, room }
const rooms = {};         // room => Set of socket IDs

// ✅ Handle user joining lobby with DP
io.on('connection', socket => {
  console.log(`🟢 New connection: ${socket.id}`);

  socket.on('check username', (username, cb) => {
    const taken = Object.values(users).some(u => u.username === username);
    cb(taken);
  });

  socket.on('join lobby', ({ username, dp }) => {
    users[socket.id] = { username, dp, room: null };
    emitRoomList();
  });

  socket.on('create room', (roomName, cb) => {
    if (!rooms[roomName]) rooms[roomName] = new Set();
    emitRoomList();
    cb(true);
  });

  socket.on('join room', (roomName, cb) => {
    const user = users[socket.id];
    if (!user) return cb(false);

    // Leave old room if needed
    if (user.room) {
      socket.leave(user.room);
      rooms[user.room].delete(socket.id);
      broadcastUsers(user.room);
    }

    // Join new room
    user.room = roomName;
    socket.join(roomName);
    rooms[roomName] = rooms[roomName] || new Set();
    rooms[roomName].add(socket.id);

    socket.emit('joined room', roomName, getRoomUsers(roomName));
    broadcastUsers(roomName);
    cb(true);
  });

  socket.on('chat message', msg => {
    const user = users[socket.id];
    if (!user || !user.room) return;
    msg.user = user.username;
    msg.dp = user.dp;
    io.to(user.room).emit('chat message', msg);
  });

  socket.on('typing', room => {
    const user = users[socket.id];
    if (user) socket.to(room).emit('typing', user.username);
  });

  socket.on('stop typing', room => {
    const user = users[socket.id];
    if (user) socket.to(room).emit('stop typing', user.username);
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user && user.room) {
      rooms[user.room].delete(socket.id);
      broadcastUsers(user.room);
    }
    delete users[socket.id];
    emitRoomList();
    console.log(`🔴 Disconnected: ${socket.id}`);
  });
});

function getRoomUsers(room) {
  return Array.from(rooms[room] || []).map(id => ({
    username: users[id].username,
    dp: users[id].dp
  }));
}

function broadcastUsers(room) {
  io.to(room).emit('room users', getRoomUsers(room));
}

function emitRoomList() {
  io.emit('room list', Object.keys(rooms));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
