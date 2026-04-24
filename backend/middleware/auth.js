const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const token = authHeader.slice(7).trim();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId =
      decoded.id ||
      decoded._id ||
      decoded.userId ||
      decoded.uid ||
      decoded.sub;

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido: usuario no encontrado en token' });
    }

    req.userId = String(userId);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};
