const express = require('express');
const auth = require('../middleware/auth');
const Message = require('../models/Message');

const router = express.Router();

/* GET /api/chat/:roomId — historial de mensajes */
router.get('/:roomId', auth, async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({ error: 'Sala requerida' });
    }

    const messages = await Message.find({ roomId })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate('sender', 'username email');

    res.json(messages);
  } catch (err) {
    console.error('GET /api/chat/:roomId error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* POST /api/chat/:roomId — fallback HTTP, por si el socket se desconecta */
router.post('/:roomId', auth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { text } = req.body;

    if (!roomId || !text || !text.trim()) {
      return res.status(400).json({ error: 'Mensaje vacío' });
    }

    const msg = await Message.create({
      roomId,
      sender: req.userId,
      text: text.trim().slice(0, 500)
    });

    await msg.populate('sender', 'username email');

    res.status(201).json(msg);
  } catch (err) {
    console.error('POST /api/chat/:roomId error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
