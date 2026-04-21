const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:   { type: String, required: true, maxlength: [500, 'Mensaje muy largo'] }
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
