const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'El nombre de usuario es requerido'],
    unique: true,
    trim: true,
    minlength: [3, 'Mínimo 3 caracteres'],
    maxlength: [30, 'Máximo 30 caracteres'],
    match: [/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guión bajo']
  },
  email: {
    type: String,
    required: [true, 'El correo es requerido'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Correo inválido']
  },
  password: {
    type: String,
    required: [true, 'La contraseña es requerida']
  },
  bio: {
    type: String,
    default: '',
    maxlength: [200, 'Máximo 200 caracteres']
  },
  location: {
    type: String,
    default: '',
    maxlength: [60, 'Máximo 60 caracteres']
  },
  favoriteGenres: {
    type: [String],
    default: []
  }
}, { timestamps: true });

// No retornar password en queries
userSchema.set('toJSON', {
  transform: (_doc, ret) => { delete ret.password; return ret; }
});

module.exports = mongoose.model('User', userSchema);
