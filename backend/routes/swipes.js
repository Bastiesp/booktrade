const express = require('express');
const auth    = require('../middleware/auth');
const Swipe   = require('../models/Swipe');
const Book    = require('../models/Book');
const User    = require('../models/User');
const router  = express.Router();

/* ── POST /api/swipes ───────────────────────────── */
// Deslizar un libro (right = me interesa, left = paso)
router.post('/', auth, async (req, res) => {
  try {
    const { bookId, direction } = req.body;

    if (!bookId || !['right', 'left'].includes(direction))
      return res.status(400).json({ error: 'bookId y direction (right|left) requeridos' });

    /* Verificar que el libro existe y no es mío */
    const book = await Book.findById(bookId).populate('owner', 'username email location');
    if (!book)             return res.status(404).json({ error: 'Libro no encontrado' });
    if (book.owner._id.toString() === req.userId)
      return res.status(400).json({ error: 'No puedes deslizar tus propios libros' });

    /* Registrar el swipe (ignorar si ya existía) */
    try {
      await Swipe.create({ swiper: req.userId, book: bookId, direction });
    } catch (e) {
      if (e.code !== 11000) throw e; // si ya existía, ignorar
    }

    /* ── Detectar MATCH ─────────────────────────── */
    let match = null;

    if (direction === 'right') {
      // ¿El dueño del libro deslizó right en alguno de MIS libros?
      const myBooks   = await Book.find({ owner: req.userId }).select('_id title author');
      const myBookIds = myBooks.map(b => b._id);

      const theirSwipe = await Swipe.findOne({
        swiper:    book.owner._id,
        book:      { $in: myBookIds },
        direction: 'right'
      }).populate('book', 'title author');

      if (theirSwipe) {
        const me = await User.findById(req.userId).select('username email');
        match = {
          matchedUser: {
            id:       book.owner._id,
            username: book.owner.username,
            email:    book.owner.email,
            location: book.owner.location
          },
          theirBook: {
            id:     book._id,
            title:  book.title,
            author: book.author
          },
          myBook: {
            id:     theirSwipe.book._id,
            title:  theirSwipe.book.title,
            author: theirSwipe.book.author
          }
        };
      }
    }

    res.json({ swiped: true, match });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ── GET /api/swipes/matches ────────────────────── */
// Todos mis matches actuales
router.get('/matches', auth, async (req, res) => {
  try {
    /* Libros que yo deslicé a la derecha */
    const myRightSwipes = await Swipe.find({ swiper: req.userId, direction: 'right' })
      .populate({
        path: 'book',
        populate: { path: 'owner', select: 'username email location' }
      });

    /* Mis propios libros */
    const myBooks   = await Book.find({ owner: req.userId }).select('_id title author');
    const myBookIds = myBooks.map(b => b._id);

    const matches = [];
    const seen    = new Set(); // evitar duplicados por usuario

    for (const swipe of myRightSwipes) {
      if (!swipe.book?.owner) continue;

      const ownerId = swipe.book.owner._id.toString();
      if (seen.has(ownerId)) continue;

      /* ¿El dueño deslizó alguno de mis libros a la derecha? */
      const theirSwipe = await Swipe.findOne({
        swiper:    swipe.book.owner._id,
        book:      { $in: myBookIds },
        direction: 'right'
      }).populate('book', 'title author');

      if (theirSwipe) {
        seen.add(ownerId);
        matches.push({
          id: `${req.userId}_${ownerId}`,
          matchedUser: {
            id:       swipe.book.owner._id,
            username: swipe.book.owner.username,
            email:    swipe.book.owner.email,
            location: swipe.book.owner.location
          },
          theirBook: {
            id:     swipe.book._id,
            title:  swipe.book.title,
            author: swipe.book.author
          },
          myBook: {
            id:     theirSwipe.book._id,
            title:  theirSwipe.book.title,
            author: theirSwipe.book.author
          },
          createdAt: theirSwipe.createdAt
        });
      }
    }

    /* Ordenar del más reciente al más antiguo */
    matches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(matches);
  } catch {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
