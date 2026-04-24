const express = require('express');
const auth    = require('../middleware/auth');
const User    = require('../models/User');
const Book    = require('../models/Book');
const router  = express.Router();

/* ── GET /api/users/me ──────────────────────────── */
router.get('/me', auth, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const totalBooks = await Book.countDocuments({ owner: req.userId });

    res.json({
      ...user.toJSON(),
      id: user._id,
      _id: user._id,
      totalBooks
    });
  } catch (err) {
    console.error('GET /api/users/me error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── PUT /api/users/me ──────────────────────────── */
router.put('/me', auth, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { bio, location, favoriteGenres } = req.body;

    const user = await User.findByIdAndUpdate(
      req.userId,
      { bio, location, favoriteGenres },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      ...user.toJSON(),
      id: user._id,
      _id: user._id
    });
  } catch (err) {
    console.error('PUT /api/users/me error:', err);

    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: Object.values(err.errors)[0].message
      });
    }

    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
