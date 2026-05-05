const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const User     = require('../models/User');

const router = express.Router();

const TERMS_VERSION = 'booktrade-legal-v1';

function makeToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return {
    id: user._id,
    _id: user._id,
    username: user.username,
    email: user.email,
    bio: user.bio,
    location: user.location,
    favoriteGenres: user.favoriteGenres,
    birthDate: user.birthDate,
    acceptedTermsAt: user.acceptedTermsAt,
    acceptedTermsVersion: user.acceptedTermsVersion,
    profilePhoto: user.profilePhoto,
    verificationStatus: user.verificationStatus,
    completedExchanges: user.completedExchanges,
    level: user.level,
    ratingAvg: user.ratingAvg,
    ratingCount: user.ratingCount,
    role: user.role,
    onboardingCompleted: user.onboardingCompleted
  };
}

function userAge(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();

  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function appBaseUrl(req) {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
}

async function sendResetEmail(email, resetUrl) {
  function getSmtpStatus() {
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

  const status = typeof smtpStatus === 'function' ? smtpStatus() : getSmtpStatus();

  console.log('📨 SMTP status:', JSON.stringify(status));
  console.log('🔗 Reset URL generado para:', email, resetUrl);

  if (!status.hasSmtpHost || !status.hasSmtpUser || !status.hasSmtpPass) {
    console.log('🔐 LINK RECUPERACIÓN BOOKTRADE:', email, resetUrl);
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

  console.log('📨 Intentando enviar correo de recuperación a:', email);

  const sendPromise = transporter.sendMail({
    from: process.env.MAIL_FROM || `BookTrade <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Restablecer contraseña — BookTrade',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827;max-width:560px;margin:auto">
        <h2 style="color:#0B5ED7">Restablecer contraseña</h2>
        <p>Recibimos una solicitud para cambiar tu contraseña en <b>BookTrade</b>.</p>
        <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">
            Crear nueva contraseña
          </a>
        </p>
        <p>Este enlace vence en 1 hora.</p>
        <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
      </div>
    `
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout enviando correo SMTP')), 18000)
  );

  const info = await Promise.race([sendPromise, timeoutPromise]);

  console.log('✅ Correo de recuperación enviado:', {
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response
  });

  return { sent: true, info };
}


function smtpStatus() {
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

router.get('/smtp-status', (_req, res) => {
  res.json({ ok: true, ...smtpStatus() });
});


/* POST /api/auth/register */
router.post('/register', async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      birthDate,
      acceptedTerms
    } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    if (!birthDate) {
      return res.status(400).json({ error: 'La fecha de nacimiento es requerida' });
    }

    const age = userAge(birthDate);
    if (age === null) {
      return res.status(400).json({ error: 'Fecha de nacimiento inválida' });
    }

    if (age < 14) {
      return res.status(400).json({ error: 'Debes tener al menos 14 años para registrarte' });
    }

    if (acceptedTerms !== true) {
      return res.status(400).json({ error: 'Debes aceptar los términos legales, reglas y política de comunidad' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existing = await User.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { username: username.trim() }
      ]
    });

    if (existing) {
      const field = existing.email === email.toLowerCase().trim() ? 'correo' : 'nombre de usuario';
      return res.status(409).json({ error: `Este ${field} ya está registrado` });
    }

    const hashed = await bcrypt.hash(password, 12);

    const user = await User.create({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      birthDate: new Date(birthDate),
      acceptedTermsAt: new Date(),
      acceptedTermsVersion: TERMS_VERSION
    });

    const token = makeToken(user);

    res.status(201).json({
      token,
      user: publicUser(user)
    });
  } catch (err) {
    console.error('POST /api/auth/register error:', err);

    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] === 'email' ? 'correo' : 'nombre de usuario';
      return res.status(409).json({ error: `Este ${field} ya está registrado` });
    }

    if (err.name === 'ValidationError') {
      const msg = Object.values(err.errors)[0].message;
      return res.status(400).json({ error: msg });
    }

    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* POST /api/auth/login */
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Ingresa tus credenciales' });
    }

    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase().trim() },
        { username: identifier.trim() }
      ],
      accountStatus: { $ne: 'deleted' }
    }).select('+password');

    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    if (user.accountStatus === 'blocked') {
      return res.status(403).json({ error: 'Tu cuenta está bloqueada. Contacta al administrador.' });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = makeToken(user);

    res.json({
      token,
      user: publicUser(user)
    });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* POST /api/auth/forgot-password */
router.post('/forgot-password', async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    console.log(`📩 [${requestId}] Solicitud recuperación contraseña recibida:`, email || '(sin email)');

    if (!email) {
      return res.status(400).json({ error: 'Ingresa tu correo' });
    }

    const generic = {
      ok: true,
      message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.'
    };

    const user = await User.findOne({
      email,
      accountStatus: { $ne: 'deleted' }
    });

    if (!user) {
      return res.json(generic);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const resetUrl = `${appBaseUrl(req)}/reset-password.html?token=${rawToken}`;

    await sendResetEmail(user.email, resetUrl);

    res.json(generic);
  } catch (err) {
    console.error(`❌ [${typeof requestId !== 'undefined' ? requestId : 'noid'}] POST /api/auth/forgot-password error:`, {message:err.message,code:err.code,command:err.command,response:err.response,responseCode:err.responseCode,stack:err.stack});
    res.status(500).json({ error: 'No se pudo enviar el correo de recuperación' });
  }
});

/* POST /api/auth/reset-password */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token y contraseña son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');

    const user = await User.findOne({
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

    res.json({
      ok: true,
      message: 'Contraseña actualizada correctamente'
    });
  } catch (err) {
    console.error('POST /api/auth/reset-password error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
