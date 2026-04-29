const mongoose = require('mongoose');

const swipeSchema = new mongoose.Schema({
  swiper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true,
    index: true
  },
  direction: {
    type: String,
    enum: ['right', 'left'],
    required: true,
    index: true
  }
}, { timestamps: true });

swipeSchema.index({ swiper: 1, book: 1 }, { unique: true });
swipeSchema.index({ swiper: 1, direction: 1 });
swipeSchema.index({ book: 1, direction: 1 });
swipeSchema.index({ swiper: 1, book: 1, direction: 1 });

module.exports = mongoose.model('Swipe', swipeSchema);
