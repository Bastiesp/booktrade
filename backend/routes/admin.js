const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Book = require('../models/Book');
const Exchange = require('../models/Exchange');
const Notification = require('../models/Notification');
const Message = require('../models/Message');

const router = express.Router();

function allowedAdminEmails() {
  return String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

    const admins = allowedAdminEmails();
    const isAdmin = user.role === 'admin' || admins.includes(String(user.email).toLowerCase());

    if (!isAdmin) {
      return res.status(403).json({ error: 'Acceso solo para administrador' });
    }

    req.adminUser = user;
    next();
  } catch (err) {
    console.error('Admin auth error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

router.get('/summary', auth, requireAdmin, async (_req, res) => {
  try {
    const [
      users,
      books,
      activeBooks,
      exchangesCompleted,
      exchangesPending,
      messages,
      pendingVerifications,
      unreadNotifications
    ] = await Promise.all([
      User.countDocuments(),
      Book.countDocuments(),
      Book.countDocuments({ available: true }),
      Exchange.countDocuments({ status: 'completed' }),
      Exchange.countDocuments({ status: 'pending' }),
      Message.countDocuments(),
      User.countDocuments({ profilePhoto: { $ne: '' }, verificationStatus: 'pending' }),
      Notification.countDocuments({ read: false })
    ]);

    res.json({
      users,
      books,
      activeBooks,
      exchangesCompleted,
      exchangesPending,
      messages,
      pendingVerifications,
      unreadNotifications
    });
  } catch (err) {
    console.error('GET /api/admin/summary error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/users', auth, requireAdmin, async (_req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(200);

    const userIds = users.map(u => u._id);
    const bookCounts = await Book.aggregate([
      { $match: { owner: { $in: userIds } } },
      { $group: { _id: '$owner', total: { $sum: 1 }, active: { $sum: { $cond: ['$available', 1, 0] } } } }
    ]);

    const counts = {};
    bookCounts.forEach(x => counts[String(x._id)] = x);

    res.json(users.map(u => {
      const data = u.toJSON();
      data.totalBooks = counts[String(u._id)]?.total || 0;
      data.activeBooks = counts[String(u._id)]?.active || 0;
      return data;
    }));
  } catch (err) {
    console.error('GET /api/admin/users error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/verifications', auth, requireAdmin, async (_req, res) => {
  try {
    const users = await User.find({
      profilePhoto: { $ne: '' },
      verificationStatus: 'pending'
    })
      .select('-password')
      .sort({ updatedAt: -1 })
      .limit(100);

    res.json(users);
  } catch (err) {
    console.error('GET /api/admin/verifications error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/users/:id/verification', auth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['verified', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { verificationStatus: status },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    await Notification.create({
      user: user._id,
      type: 'system',
      title: status === 'verified' ? 'Foto verificada' : status === 'rejected' ? 'Foto rechazada' : 'Verificación pendiente',
      body: status === 'verified'
        ? 'Tu perfil ahora aparece como verificado.'
        : status === 'rejected'
          ? 'Tu foto fue rechazada. Sube una foto clara de tu rostro.'
          : 'Tu foto quedó pendiente de revisión.',
      data: { verificationStatus: status }
    });

    res.json(user);
  } catch (err) {
    console.error('PUT /api/admin/users/:id/verification error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/books', auth, requireAdmin, async (_req, res) => {
  try {
    const books = await Book.find()
      .populate('owner', 'username email location profilePhoto level verificationStatus completedExchanges ratingAvg ratingCount')
      .sort({ createdAt: -1 })
      .limit(200);

    res.json(books);
  } catch (err) {
    console.error('GET /api/admin/books error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/exchanges', auth, requireAdmin, async (_req, res) => {
  try {
    const exchanges = await Exchange.find()
      .populate('participants', 'username email location profilePhoto level completedExchanges ratingAvg ratingCount')
      .populate('requester', 'username email location profilePhoto level completedExchanges ratingAvg ratingCount')
      .populate('matchedUser', 'username email location profilePhoto level completedExchanges ratingAvg ratingCount')
      .populate('myBook', 'title author photos')
      .populate('theirBook', 'title author photos')
      .sort({ updatedAt: -1 })
      .limit(200);

    res.json(exchanges);
  } catch (err) {
    console.error('GET /api/admin/exchanges error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/users/:id/role', auth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) {
    console.error('PUT /api/admin/users/:id/role error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/books/:id', auth, requireAdmin, async (req, res) => {
  try {
    await Book.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/books/:id error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
