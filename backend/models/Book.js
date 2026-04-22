const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El dueño es requerido']
  },
  title: {
    type: String,
    required: [true, 'El título es requerido'],
    trim: true,
    maxlength: [120, 'Máximo 120 caracteres']
  },
  author: {
    type: String,
    required: [true, 'El autor es requerido'],
    trim: true,
    maxlength: [80, 'Máximo 80 caracteres']
  },
  genre: {
    type: String,
    required: [true, 'El género es requerido'],
    enum: [
      'Ficción', 'No ficción', 'Ciencia ficción', 'Fantasía',
      'Terror', 'Romance', 'Thriller', 'Historia', 'Biografía',
      'Ciencia', 'Filosofía', 'Poesía', 'Infantil', 'Cómic', 'Otro'
    ]
  },
  description: {
    type: String,
    default: '',
    maxlength: [500, 'Máximo 500 caracteres']
  },
  condition: {
    type: String,
    enum: ['Nuevo', 'Bueno', 'Regular'],
    default: 'Bueno'
  },
  /* 3 fotos obligatorias — base64 comprimidas en cliente */
  photos: {
    type: [String],
    validate: {
      validator: v => v.length === 3,
      message: 'Se requieren exactamente 3 fotos'
    },
    required: [true, 'Las 3 fotos son obligatorias']
  },
  coverColor: {
    type: String,
    default: '#8B6914'
  },
  available: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Book', bookSchema);
