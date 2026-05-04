const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', default: null, index: true },
  type: { type: String, enum: ['user', 'book', 'message', 'exchange', 'contact_admin', 'other'], default: 'user', index: true },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ['open', 'reviewing', 'waiting_user', 'resolved', 'dismissed'], default: 'open', index: true },
  adminNote: { type: String, default: '', maxlength: 2000 }, priority: { type: String, enum: ['low','normal','high','critical'], default: 'normal', index: true }
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
