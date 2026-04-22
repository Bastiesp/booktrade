require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');

const app = express();

/* ── Middleware ─────────────────────────────────── */
app.use(cors());
app.use(express.json({ limit: '20mb' })); // fotos base64 pueden ser grandes
app.use(express.urlencoded({ limit: '20mb', extended: true }));

/* ── Frontend estático desde backend/public/ ────── */
app.use(express.static(path.join(__dirname, 'public')));

/* ── API Routes ─────────────────────────────────── */
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/users',  require('./routes/users'));
app.use('/api/books',  require('./routes/books'));
app.use('/api/swipes', require('./routes/swipes'));

/* Chat route — opcional, no crashea si falta */
try {
  app.use('/api/chat', require('./routes/chat'));
} catch (e) {
  console.warn('⚠️  Chat route no disponible:', e.message);
}

/* ── Health check ───────────────────────────────── */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '2.0.0' }));

/* ── SPA fallback ───────────────────────────────── */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ── Socket.io — opcional ───────────────────────── */
let io = null;
try {
  const http      = require('http');
  const { Server} = require('socket.io');
  const jwt       = require('jsonwebtoken');
  const Message   = require('./models/Message');

  const server = http.createServer(app);
  io = new Server(server, { cors: { origin: '*' }, transports: ['websocket', 'polling'] });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Auth requerida'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id.toString();
      next();
    } catch { next(new Error('Token inválido')); }
  });

  io.on('connection', (socket) => {
    socket.on('join-chat',    (roomId) => socket.join(roomId));
    socket.on('send-message', async ({ roomId, text }) => {
      if (!text?.trim() || !roomId) return;
      try {
        const msg = await Message.create({ roomId, sender: socket.userId, text: text.trim().slice(0, 500) });
        await msg.populate('sender', 'username');
        io.to(roomId).emit('new-message', msg);
      } catch {}
    });
    socket.on('typing',      ({ roomId, username }) => socket.to(roomId).emit('user-typing', { username }));
    socket.on('stop-typing', ({ roomId })           => socket.to(roomId).emit('user-stop-typing'));
  });

  const PORT = process.env.PORT || 4000;
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('✅  MongoDB conectado');
      server.listen(PORT, () => console.log(`🚀  Servidor en http://localhost:${PORT}`));
    })
    .catch(err => { console.error('❌  MongoDB:', err.message); process.exit(1); });

} catch (e) {
  /* socket.io no disponible — arrancar sin chat en tiempo real */
  console.warn('⚠️  Socket.io no disponible, arrancando sin chat:', e.message);
  const PORT = process.env.PORT || 4000;
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('✅  MongoDB conectado');
      app.listen(PORT, () => console.log(`🚀  Servidor en http://localhost:${PORT}`));
    })
    .catch(err => { console.error('❌  MongoDB:', err.message); process.exit(1); });
}
