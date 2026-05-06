const mongoose = require('mongoose');

function calcLevel(n) {
  n = Number(n || 0);
  if (n >= 35) return 'Oro';
  if (n >= 15) return 'Plata';
  if (n >= 7) return 'Bronce';
  return 'Aficionado';
}

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
  },

  birthDate: {
    type: Date,
    default: null
  },

  acceptedTermsAt: {
    type: Date,
    default: null
  },

  acceptedTermsVersion: {
    type: String,
    default: ''
  },

  profilePhoto: {
    type: String,
    default: ''
  },

  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending',
    index: true
  },

  // Insignia azul de usuario verificado.
  // Se mantiene separada de la foto aprobada para que Booktrade pueda decidir
  // qué cuentas tienen verificación oficial.
  verified: {
    type: Boolean,
    default: false,
    index: true
  },

  completedExchanges: {
    type: Number,
    default: 0,
    min: 0
  },

  level: {
    type: String,
    enum: ['Aficionado', 'Bronce', 'Plata', 'Oro'],
    default: 'Aficionado'
  },

  ratingAvg: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },

  ratingCount: {
    type: Number,
    default: 0,
    min: 0
  },


  onboardingCompleted: {
    type: Boolean,
    default: false
  },

  resetPasswordToken: { type: String, default: '' },
  resetPasswordExpires: { type: Date, default: null },
  accountStatus: { type: String, enum: ['active', 'blocked', 'deleted'], default: 'active', index: true },
  deletedAt: { type: Date, default: null },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  }
}, { timestamps: true });

userSchema.pre('save', function(next) {
  this.level = calcLevel(this.completedExchanges);

  // Compatibilidad: si el admin marca verificationStatus como "verified",
  // el frontend recibirá verified=true. Si alguien marca verified=true directamente,
  // también dejamos el estado principal como verified.
  if (this.verificationStatus === 'verified') {
    this.verified = true;
  }

  if (this.verified === true && this.verificationStatus !== 'verified') {
    this.verificationStatus = 'verified';
  }

  if (this.verificationStatus === 'rejected') {
    this.verified = false;
  }

  next();
});

userSchema.methods.refreshLevel = function() {
  this.level = calcLevel(this.completedExchanges);
  return this.level;
};

userSchema.methods.isVerifiedAccount = function() {
  return Boolean(this.verified || this.verificationStatus === 'verified');
};

userSchema.statics.levelFor = calcLevel;

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;

    ret.id = ret._id;
    ret.level = calcLevel(ret.completedExchanges);

    // Campos cómodos para el frontend. Así app.js puede usar user.verified
    // o user.isVerified sin depender del nombre exacto del campo interno.
    ret.verified = Boolean(ret.verified || ret.verificationStatus === 'verified');
    ret.isVerified = ret.verified;

    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
