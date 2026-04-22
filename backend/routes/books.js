const express = require('express');
const auth    = require('../middleware/auth');
const Book    = require('../models/Book');
const Swipe   = require('../models/Swipe');
const User    = require('../models/User');
const router  = express.Router();

/* ── GET /api/books/discover ────────────────────── */
router.get('/discover', auth, async (req, res) => {
  try {
    const { genre, city } = req.query;

    const swiped    = await Swipe.find({ swiper: req.userId }).select('book');
    const swipedIds = swiped.map(s => s.book);

    let ownerIds;
    if (city && city.trim()) {
      const usersInCity = await User.find({
        location: { $regex: city.trim(), $options: 'i' }
      }).select('_id');
      ownerIds = usersInCity.map(u => u._id);
    }

    const filter = {
      owner:     ownerIds ? { $in: ownerIds, $ne: req.userId } : { $ne: req.userId },
      _id:       { $nin: swipedIds },
      available: true
    };
    if (genre && genre !== 'Todos') filter.genre = genre;

    const books = await Book.find(filter)
      .populate('owner', 'username location')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(books);
  } catch (err) {
    console.error('discover error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── GET /api/books/mine ────────────────────────── */
router.get('/mine', auth, async (req, res) => {
  try {
    const books = await Book.find({ owner: req.userId }).sort({ createdAt: -1 });
    res.json(books);
  } catch (err) {
    console.error('mine error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── POST /api/books ────────────────────────────── */
router.post('/', auth, async (req, res) => {
  try {
    const { title, author, genre, description, condition, photos, coverColor } = req.body;

    if (!title || !author || !genre)
      return res.status(400).json({ error: 'Título, autor y género son requeridos' });

    if (!photos || !Array.isArray(photos) || photos.length !== 3)
      return res.status(400).json({ error: 'Se requieren exactamente 3 fotos' });

    const book = await Book.create({
      owner: req.userId,
      title, author, genre,
      description: description || '',
      condition: condition || 'Bueno',
      photos,
      coverColor: coverColor || '#8B6914'
    });

    await book.populate('owner', 'username');
    res.status(201).json(book);
  } catch (err) {
    console.error('create book error:', err);
    if (err.name === 'ValidationError')
      return res.status(400).json({ error: Object.values(err.errors)[0].message });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── PUT /api/books/:id ─────────────────────────── */
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, author, genre, description, condition, photos, available } = req.body;

    const updateData = { title, author, genre, description, condition, available };
    if (photos && Array.isArray(photos) && photos.length === 3) {
      updateData.photos = photos;
    }

    const book = await Book.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      updateData,
      { new: true, runValidators: false } // runValidators false para no requerir fotos en edición
    );

    if (!book) return res.status(404).json({ error: 'Libro no encontrado' });
    res.json(book);
  } catch (err) {
    if (err.name === 'ValidationError')
      return res.status(400).json({ error: Object.values(err.errors)[0].message });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── DELETE /api/books/:id ──────────────────────── */
router.delete('/:id', auth, async (req, res) => {
  try {
    const book = await Book.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!book) return res.status(404).json({ error: 'Libro no encontrado' });
    await Swipe.deleteMany({ book: req.params.id });
    res.json({ message: 'Libro eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
