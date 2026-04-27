const mongoose = require('mongoose');

const adminActionSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  targetType: {
    type: String,
    default: '',
    index: true
  },
  targetId: {
    type: String,
    default: '',
    index: true
  },
  detail: {
    type: Object,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('AdminAction', adminActionSchema);
