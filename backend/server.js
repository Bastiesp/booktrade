require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const http     = require('http');
const { Server } = require('socket.io');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');

const UserDirect = require('./models/User');

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


/* ── SERVER_DIRECT_SMTP_STATUS ───────────────────── */
function smtpStatusDirect() {
  let nodemailerInstalled = false;
  try {
    require.resolve('nodemailer');
    nodemailerInstalled = true;
  } catch {}

  return {
    nodemailerInstalled,
    hasSmtpHost: Boolean(process.env.SMTP_HOST),
    hasSmtpPort: Boolean(process.env.SMTP_PORT),
    hasSmtpUser: Boolean(process.env.SMTP_USER),
    hasSmtpPass: Boolean(process.env.SMTP_PASS),
    hasMailFrom: Boolean(process.env.MAIL_FROM),
    hasAppUrl: Boolean(process.env.APP_URL),
    smtpHost: process.env.SMTP_HOST || null,
    smtpPort: process.env.SMTP_PORT || null,
    smtpUser: process.env.SMTP_USER ? process.env.SMTP_USER.replace(/(.{2}).+(@.*)/, '$1***$2') : null,
    mailFrom: process.env.MAIL_FROM || null
  };
}

function appBaseUrlDirect(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

async function sendResetEmailDirect(email, resetUrl) {
  const status = smtpStatusDirect();

  console.log('📨 DIRECT SMTP status:', JSON.stringify(status));
  console.log('🔗 DIRECT reset URL:', email, resetUrl);

  if (!status.hasSmtpHost || !status.hasSmtpUser || !status.hasSmtpPass) {
    console.log('🔐 DIRECT LINK RECUPERACIÓN BOOKTRADE:', email, resetUrl);
    return { sent: false, logged: true, reason: 'SMTP no configurado' };
  }

  if (!status.nodemailerInstalled) {
    throw new Error('Nodemailer no está instalado. Revisa package.json y redeploy.');
  }

  const nodemailer = require('nodemailer');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });

  console.log('📨 DIRECT intentando enviar correo a:', email);

  const sendPromise = transporter.sendMail({
    from: process.env.MAIL_FROM || `BookTrade <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Restablecer contraseña — BookTrade',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827;max-width:560px;margin:auto">
      <h2 style="color:#0B5ED7">Restablecer contraseña</h2>
      <p>Recibimos una solicitud para cambiar tu contraseña en <b>BookTrade</b>.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Crear nueva contraseña</a></p>
      <p>Este enlace vence en 1 hora.</p>
      <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
    </div>`
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout enviando correo SMTP')), 18000)
  );

  const info = await Promise.race([sendPromise, timeoutPromise]);

  console.log('✅ DIRECT correo enviado:', {
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response
  });

  return { sent: true, info };
}

app.get('/api/auth/smtp-status', (_req, res) => {
  console.log('🧪 DIRECT /api/auth/smtp-status ejecutado');
  res.json({ ok: true, directFromServer: true, ...smtpStatusDirect() });
});

app.get('/api/smtp-status', (_req, res) => {
  console.log('🧪 DIRECT /api/smtp-status ejecutado');
  res.json({ ok: true, directFromServer: true, ...smtpStatusDirect() });
});

app.get('/api/auth/debug-forgot', async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  try {
    const email = String(req.query.email || '').toLowerCase().trim();
    console.log(`🧪 [${requestId}] DIRECT DEBUG FORGOT ejecutado:`, email || '(sin email)');

    if (!email) {
      return res.json({
        ok: true,
        reachedBackend: true,
        directFromServer: true,
        message: 'Endpoint activo. Agrega ?email=tu-correo@gmail.com para probar envío.',
        smtp: smtpStatusDirect()
      });
    }

    const resetUrl = `${appBaseUrlDirect(req)}/reset-password.html?token=debug-${requestId}`;
    await sendResetEmailDirect(email, resetUrl);

    res.json({
      ok: true,
      reachedBackend: true,
      directFromServer: true,
      message: 'Se ejecutó intento de envío. Revisa correo y logs de Render.',
      email,
      smtp: smtpStatusDirect(),
      debugResetUrl: resetUrl
    });
  } catch (err) {
    console.error(`❌ [${requestId}] DIRECT DEBUG FORGOT error:`, {
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response,
      responseCode: err.responseCode,
      stack: err.stack
    });

    res.status(500).json({
      ok: false,
      reachedBackend: true,
      directFromServer: true,
      error: err.message,
      code: err.code || null,
      command: err.command || null,
      response: err.response || null,
      responseCode: err.responseCode || null
    });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');

  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    console.log(`📩 [${requestId}] DIRECT forgot-password recibido:`, email || '(sin email)');

    if (!email) {
      return res.status(400).json({ error: 'Ingresa tu correo' });
    }

    const generic = {
      ok: true,
      message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.'
    };

    const user = await UserDirect.findOne({
      email,
      accountStatus: { $ne: 'deleted' }
    });

    if (!user) {
      console.log(`📩 [${requestId}] DIRECT correo no registrado, respuesta genérica.`);
      return res.json(generic);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const resetUrl = `${appBaseUrlDirect(req)}/reset-password.html?token=${rawToken}`;
    await sendResetEmailDirect(user.email, resetUrl);

    console.log(`✅ [${requestId}] DIRECT recuperación completada para:`, email);
    res.json(generic);
  } catch (err) {
    console.error(`❌ [${requestId}] DIRECT forgot-password error:`, {
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response,
      responseCode: err.responseCode,
      stack: err.stack
    });

    res.status(500).json({ error: err.message || 'No se pudo enviar el correo de recuperación' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token y contraseña son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');

    const user = await UserDirect.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
      accountStatus: { $ne: 'deleted' }
    }).select('+password +resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return res.status(400).json({ error: 'El enlace es inválido o expiró' });
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordToken = '';
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('❌ DIRECT reset-password error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});


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
app.use('/api/upload',        require('./routes/upload'));
app.use('/api/support',       require('./routes/support'));
app.use('/api/admin',         require('./routes/admin'));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '3.4.0-direct-smtp-debug',
    socket: 'enabled',
    cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
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

      let otherUserId = null;
      const parts = String(roomId).split('_');

      // Formato nuevo: match_USERA_USERB_BOOKA_BOOKB
      if (parts[0] === 'match' && parts.length >= 3) {
        const a = parts[1];
        const b = parts[2];
        otherUserId = String(a) === String(socket.userId) ? b : a;
      } else {
        // Formato antiguo: USERA_USERB
        otherUserId = parts.find(x => x && x !== String(socket.userId));
      }

      if (otherUserId && otherUserId !== 'match') {
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

        // Si el receptor no tiene abierto ese chat, igual recibe el evento
        // por su sala privada de usuario y puede mostrar badge rojo.
        io.to('user:' + otherUserId).emit('new-message', payload);
        io.to('user:' + otherUserId).emit('notification-update', {
          user: otherUserId,
          type: 'message',
          roomId
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
