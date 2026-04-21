const mongoose = require('mongoose');

const swipeSchema = new mongoose.Schema({
  swiper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true
  },
  direction: {
    type: String,
    enum: ['right', 'left'],
    required: true
  }
}, { timestamps: true });

// Un usuario solo puede deslizar cada libro una vez
swipeSchema.index({ swiper: 1, book: 1 }, { unique: true });

module.exports = mongoose.model('Swipe', swipeSchema);
