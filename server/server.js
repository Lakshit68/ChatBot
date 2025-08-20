import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import Message from './models/Message.js';
import messagesRouter from './routes/messages.js';

const app = express();
const server = http.createServer(app);

// CORS: allow multiple origins (env can be comma-separated), merged with sensible local defaults
const defaultAllowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000'
];
const envAllowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : [];
const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envAllowedOrigins]));

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin === 'null') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
};

const io = new Server(server, {
  cors: corsOptions
});

// Connect MongoDB
const mongoUri = process.env.MONGO_URI ;
await mongoose.connect(mongoUri, { dbName: 'chatbot_app' });

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'chatbot-server' });
});
app.use('/api/messages', messagesRouter);

// Presence state in-memory: roomId -> Map(userId => { username, status, typing })
const roomPresence = new Map();

function ensureRoom(roomId) {
  if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
  return roomPresence.get(roomId);
}

function broadcastPresence(roomId) {
  const room = ensureRoom(roomId);
  const presenceList = Array.from(room.entries()).map(([userId, v]) => ({
    userId,
    username: v.username,
    status: v.status,
    typing: v.typing === true
  }));
  io.to(roomId).emit('presence:update', { roomId, users: presenceList });
}

// Socket.IO handlers
io.on('connection', (socket) => {
  // Expect initial auth/user info from client
  socket.on('user:init', ({ userId, username }) => {
    socket.data.userId = userId;
    socket.data.username = username;
    socket.emit('user:ack', { ok: true });
  });

  // Join room
  socket.on('room:join', async ({ roomId }) => {
    if (!socket.data.userId || !roomId) return;
    await socket.join(roomId);

    const room = ensureRoom(roomId);
    room.set(socket.data.userId, {
      username: socket.data.username,
      status: 'online',
      typing: false
    });

    // Send recent messages
    const recent = await Message.find({ roomId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    socket.emit('messages:recent', { roomId, messages: recent.reverse() });

    // Notify others
    socket.to(roomId).emit('presence:online', {
      userId: socket.data.userId,
      username: socket.data.username,
      roomId
    });
    broadcastPresence(roomId);
  });

  // Leave room
  socket.on('room:leave', ({ roomId }) => {
    if (!socket.data.userId || !roomId) return;
    socket.leave(roomId);
    const room = ensureRoom(roomId);
    if (room.has(socket.data.userId)) {
      room.delete(socket.data.userId);
      io.to(roomId).emit('presence:offline', {
        userId: socket.data.userId,
        username: socket.data.username,
        roomId
      });
      broadcastPresence(roomId);
    }
  });

  // Typing indicators
  socket.on('typing', ({ roomId }) => {
    if (!socket.data.userId || !roomId) return;
    const room = ensureRoom(roomId);
    const u = room.get(socket.data.userId);
    if (u) {
      u.typing = true;
      room.set(socket.data.userId, u);
      socket.to(roomId).emit('typing', {
        roomId,
        userId: socket.data.userId,
        username: socket.data.username
      });
      broadcastPresence(roomId);
    }
  });

  socket.on('stop_typing', ({ roomId }) => {
    if (!socket.data.userId || !roomId) return;
    const room = ensureRoom(roomId);
    const u = room.get(socket.data.userId);
    if (u) {
      u.typing = false;
      room.set(socket.data.userId, u);
      socket.to(roomId).emit('stop_typing', {
        roomId,
        userId: socket.data.userId,
        username: socket.data.username
      });
      broadcastPresence(roomId);
    }
  });

  // Send message
  socket.on('message:send', async ({ roomId, text }) => {
    if (!socket.data.userId || !roomId || !text?.trim()) return;

    const doc = await Message.create({
      roomId,
      userId: socket.data.userId,
      username: socket.data.username,
      text: text.trim()
    });

    io.to(roomId).emit('message:new', {
      _id: doc._id.toString(),
      roomId,
      userId: doc.userId,
      username: doc.username,
      text: doc.text,
      createdAt: doc.createdAt
    });
  });

  // Disconnect handling
  socket.on('disconnecting', () => {
    const rooms = [...socket.rooms].filter((r) => r !== socket.id);
    for (const roomId of rooms) {
      const room = ensureRoom(roomId);
      if (socket.data.userId && room.has(socket.data.userId)) {
        room.delete(socket.data.userId);
        socket.to(roomId).emit('presence:offline', {
          userId: socket.data.userId,
          username: socket.data.username,
          roomId
        });
        broadcastPresence(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});


