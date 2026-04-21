require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');

const app = express();

/* ── Middleware ─────────────────────────────────── */
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

/* ── API Routes ─────────────────────────────────── */
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/users',  require('./routes/users'));
app.use('/api/books',  require('./routes/books'));
app.use('/api/swipes', require('./routes/swipes'));

/* ── Health check ───────────────────────────────── */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

/* ── Arrancar servidor ──────────────────────────── */
const PORT = process.env.PORT || 4000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅  MongoDB conectado');
    app.listen(PORT, () => console.log(`🚀  Servidor en http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌  Error MongoDB:', err.message);
    process.exit(1);
  });
