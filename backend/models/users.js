const express = require('express');
const auth    = require('../middleware/auth');
const User    = require('../models/User');
const Book    = require('../models/Book');
const Exchange = require('../models/Exchange');
const router  = express.Router();

function levelFor(n) {
  n = Number(n || 0);
  if (n >= 35) return 'Oro';
  if (n >= 15) return 'Plata';
  if (n >= 7) return 'Bronce';
  return 'Aficionado';
}

function nextLevelInfo(n) {
  n = Number(n || 0);
  if (n >= 35) return { current: 'Oro', next: null, currentMin: 35, nextAt: null, remaining: 0, percent: 100 };
  if (n >= 15) return { current: 'Plata', next: 'Oro', currentMin: 15, nextAt: 35, remaining: 35 - n, percent: Math.round(((n - 15) / 20) * 100) };
  if (n >= 7) return { current: 'Bronce', next: 'Plata', currentMin: 7, nextAt: 15, remaining: 15 - n, percent: Math.round(((n - 7) / 8) * 100) };
  return { current: 'Aficionado', next: 'Bronce', currentMin: 0, nextAt: 7, remaining: 7 - n, percent: Math.round((n / 7) * 100) };
}

async function publicProfile(userId) {
  const user = await User.findById(userId).select('-password');
  if (!user) return null;

  const totalBooks = await Book.countDocuments({ owner: userId });
  const activeBooks = await Book.countDocuments({ owner: userId, available: true });
  const completed = await Exchange.countDocuments({ participants: userId, status: 'completed' });

  const data = user.toJSON();
  data.totalBooks = totalBooks;
  data.activeBooks = activeBooks;
  data.completedExchanges = data.completedExchanges || completed;
  data.level = levelFor(data.completedExchanges);
  data.levelProgress = nextLevelInfo(data.completedExchanges);
  data.ratingAvg = Number(data.ratingAvg || 0);
  data.ratingCount = Number(data.ratingCount || 0);
  return data;
}

/* ── GET /api/users/me ──────────────────────────── */
router.get('/me', auth, async (req, res) => {
  try {
    const data = await publicProfile(req.userId);
    if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(data);
  } catch (err) {
    console.error('GET /api/users/me error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── GET /api/users/:id/public ──────────────────── */
router.get('/:id/public', auth, async (req, res) => {
  try {
    const data = await publicProfile(req.params.id);
    if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(data);
  } catch (err) {
    console.error('GET /api/users/:id/public error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── PUT /api/users/me ──────────────────────────── */
router.put('/me', auth, async (req, res) => {
  try {
    const { bio, location, favoriteGenres, profilePhoto } = req.body;

    const update = { bio, location, favoriteGenres };

    if (typeof profilePhoto === 'string') {
      update.profilePhoto = profilePhoto;
      if (profilePhoto.trim()) update.verificationStatus = 'pending';
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      update,
      { new: true, runValidators: true }
    );

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const data = await publicProfile(req.userId);
    res.json(data);
  } catch (err) {
    console.error('PUT /api/users/me error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: Object.values(err.errors)[0].message });
    }
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
