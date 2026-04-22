const express = require('express');
const auth    = require('../middleware/auth');
const Message = require('../models/Message');
const router  = express.Router();

function canAccess(userId, roomId) {
  const parts = roomId.split('_');
  return parts.length === 2 && parts.includes(userId.toString());
}

/* GET /api/chat/:roomId — historial de mensajes */
router.get('/:roomId', auth, async (req, res) => {
  try {
    if (!canAccess(req.userId, req.params.roomId))
      return res.status(403).json({ error: 'Sin acceso' });

    const msgs = await Message.find({ roomId: req.params.roomId })
      .populate('sender', 'username')
      .sort({ createdAt: 1 })
      .limit(100);

    res.json(msgs);
  } catch {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
