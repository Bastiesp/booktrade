
-const express  = require('express');
-const bcrypt   = require('bcryptjs');
-const jwt      = require('jsonwebtoken');
-const User     = require('../models/User');
-const router   = express.Router();
+const jwt = require('jsonwebtoken');
 
-/* ── POST /api/auth/register ────────────────────── */
-router.post('/register', async (req, res) => {
-  try {
-    const { username, email, password } = req.body;
-
-    /* Validaciones básicas */
-    if (!username || !email || !password)
-      return res.status(400).json({ error: 'Todos los campos son requeridos' });
-
-    if (password.length < 6)
-      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
-
-    /* Verificar duplicados */
-    const existing = await User.findOne({
-      $or: [
-        { email: email.toLowerCase().trim() },
-        { username: username.trim() }
-      ]
-    });
+module.exports = (req, res, next) => {
+  const authHeader = req.headers.authorization || '';
 
-    if (existing) {
-      const field = existing.email === email.toLowerCase().trim() ? 'correo' : 'nombre de usuario';
-      return res.status(409).json({ error: `Este ${field} ya está registrado` });
-    }
-
-    /* Hash de contraseña */
-    const hashed = await bcrypt.hash(password, 12);
-    const user   = await User.create({ username: username.trim(), email, password: hashed });
-
-    /* Token */
-    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
-
-    res.status(201).json({
-      token,
-      user: { id: user._id, username: user.username, email: user.email }
-    });
-  } catch (err) {
-    if (err.code === 11000) {
-      const field = Object.keys(err.keyPattern)[0] === 'email' ? 'correo' : 'nombre de usuario';
-      return res.status(409).json({ error: `Este ${field} ya está registrado` });
-    }
-    if (err.name === 'ValidationError') {
-      const msg = Object.values(err.errors)[0].message;
-      return res.status(400).json({ error: msg });
-    }
-    res.status(500).json({ error: 'Error del servidor' });
+  if (!authHeader.startsWith('Bearer ')) {
+    return res.status(401).json({ error: 'Token requerido' });
   }
-});
 
-/* ── POST /api/auth/login ───────────────────────── */
-router.post('/login', async (req, res) => {
-  try {
-    const { identifier, password } = req.body; // identifier = email o username
+  const token = authHeader.slice(7).trim();
 
-    if (!identifier || !password)
-      return res.status(400).json({ error: 'Ingresa tus credenciales' });
-
-    const user = await User.findOne({
-      $or: [
-        { email: identifier.toLowerCase().trim() },
-        { username: identifier.trim() }
-      ]
-    }).select('+password');
-
-    if (!user)
-      return res.status(401).json({ error: 'Credenciales incorrectas' });
-
-    const valid = await bcrypt.compare(password, user.password);
-    if (!valid)
-      return res.status(401).json({ error: 'Credenciales incorrectas' });
-
-    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
-
-    res.json({
-      token,
-      user: { id: user._id, username: user.username, email: user.email }
-    });
-  } catch (err) {
-    res.status(500).json({ error: 'Error del servidor' });
+  try {
+    const decoded = jwt.verify(token, process.env.JWT_SECRET);
+    req.userId = String(decoded.id);
+    next();
+  } catch {
+    return res.status(401).json({ error: 'Token inválido' });
   }
-});
-
-module.exports = router;
+};
