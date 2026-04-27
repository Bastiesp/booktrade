require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const http     = require('http');
const { Server } = require('socket.io');
const jwt      = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET no está definido');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI no está definido');
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

const publicDir = path.join(__dirname, 'public');

/* Panel admin explícito: va ANTES del static y antes del fallback */
app.get(['/admin', '/admin.html', '/panel-admin'], (_req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

/* Frontend estático desde backend/public/ */
app.use(express.static(publicDir));

/* API routes */
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/books',         require('./routes/books'));
app.use('/api/swipes',        require('./routes/swipes'));
app.use('/api/chat',          require('./routes/chat'));
app.use('/api/exchanges',     require('./routes/exchanges'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/support',       require('./routes/support'));
app.use('/api/admin',         require('./routes/admin'));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '3.3.0-realtime-notifications-password',
    socket: 'enabled',
    adminPanel: '/admin',
    adminHtml: '/admin.html',
    adminEmailsConfigured: Boolean(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL)
  });
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 25000
});

const Message = require('./models/Message');
const Notification = require('./models/Notification');

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Auth requerida'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId =
      decoded.id ||
      decoded._id ||
      decoded.userId ||
      decoded.uid ||
      decoded.sub;

    if (!userId) return next(new Error('Token sin usuario'));

    socket.userId = String(userId);
    next();
  } catch (err) {
    next(new Error('Token inválido'));
  }
});

io.on('connection', (socket) => {
  console.log('🟢 Socket conectado:', socket.userId);
  socket.join('user:'+socket.userId);

  socket.on('join-chat', (roomId, callback) => {
    if (!roomId) {
      if (callback) callback({ ok: false, error: 'Sala inválida' });
      return;
    }

    socket.join(roomId);
    if (callback) callback({ ok: true, roomId });
  });

  socket.on('send-message', async ({ roomId, text, clientId }, callback) => {
    try {
      if (!roomId || !text || !text.trim()) {
        if (callback) callback({ ok: false, error: 'Mensaje vacío' });
        return;
      }

      const msg = await Message.create({
        roomId,
        sender: socket.userId,
        text: text.trim().slice(0, 500)
      });

      await msg.populate('sender', 'username email');

      const payload = {
        _id: msg._id,
        roomId: msg.roomId,
        sender: msg.sender,
        text: msg.text,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        clientId: clientId || null
      };

      io.to(roomId).emit('new-message', payload);

      const otherUserId = String(roomId).split('_').find(x => x !== String(socket.userId));

      if (otherUserId) {
        await Notification.create({
          user: otherUserId,
          type: 'message',
          title: 'Nuevo mensaje',
          body: payload.text.slice(0, 80),
          data: {
            roomId,
            sender: socket.userId
          }
        });

        io.to(roomId).emit('notification-update', {
          user: otherUserId,
          type: 'message'
        });
      }

      if (callback) callback({ ok: true, message: payload });
    } catch (err) {
      console.error('❌ send-message error:', err);

      if (callback) {
        callback({
          ok: false,
          error: 'No se pudo enviar el mensaje'
        });
      }

      socket.emit('message-error', {
        error: 'No se pudo enviar el mensaje'
      });
    }
  });

  socket.on('typing', ({ roomId, username }) => {
    if (!roomId) return;

    socket.to(roomId).emit('user-typing', {
      username: username || 'Usuario'
    });
  });

  socket.on('stop-typing', ({ roomId }) => {
    if (!roomId) return;
    socket.to(roomId).emit('user-stop-typing');
  });

  socket.on('disconnect', (reason) => {
    console.log('🔴 Socket desconectado:', socket.userId, reason);
  });
});

/* SPA fallback: siempre AL FINAL */
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 4000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB conectado');
    server.listen(PORT, () => {
      console.log(`🚀 Servidor en puerto ${PORT}`);
      console.log('✅ Socket.IO activo');
      console.log('✅ Panel admin en /admin');
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB:', err.message);
    process.exit(1);
  });
