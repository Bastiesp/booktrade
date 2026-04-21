const express = require('express');
const auth    = require('../middleware/auth');
const Book    = require('../models/Book');
const Swipe   = require('../models/Swipe');
const router  = express.Router();

/* ── GET /api/books/discover ────────────────────── */
// Libros de otros usuarios que aún no he deslizado
router.get('/discover', auth, async (req, res) => {
  try {
    const swiped    = await Swipe.find({ swiper: req.userId }).select('book');
    const swipedIds = swiped.map(s => s.book);

    const books = await Book.find({
      owner:     { $ne: req.userId },
      _id:       { $nin: swipedIds },
      available: true
    })
      .populate('owner', 'username location')
      .sort({ createdAt: -1 })
      .limit(30);

    res.json(books);
  } catch {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── GET /api/books/mine ────────────────────────── */
router.get('/mine', auth, async (req, res) => {
  try {
    const books = await Book.find({ owner: req.userId }).sort({ createdAt: -1 });
    res.json(books);
  } catch {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── POST /api/books ────────────────────────────── */
router.post('/', auth, async (req, res) => {
  try {
    const { title, author, genre, description, condition, coverColor } = req.body;

    if (!title || !author || !genre)
      return res.status(400).json({ error: 'Título, autor y género son requeridos' });

    const book = await Book.create({
      owner: req.userId,
      title, author, genre, description, condition,
      coverColor: coverColor || '#8B6914'
    });

    await book.populate('owner', 'username');
    res.status(201).json(book);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: Object.values(err.errors)[0].message });
    }
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── PUT /api/books/:id ─────────────────────────── */
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, author, genre, description, condition, available } = req.body;

    const book = await Book.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      { title, author, genre, description, condition, available },
      { new: true, runValidators: true }
    );

    if (!book) return res.status(404).json({ error: 'Libro no encontrado' });
    res.json(book);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: Object.values(err.errors)[0].message });
    }
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── DELETE /api/books/:id ──────────────────────── */
router.delete('/:id', auth, async (req, res) => {
  try {
    const book = await Book.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!book) return res.status(404).json({ error: 'Libro no encontrado' });

    // Borrar swipes asociados
    await Swipe.deleteMany({ book: req.params.id });

    res.json({ message: 'Libro eliminado' });
  } catch {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
