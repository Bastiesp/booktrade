const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = String(
      decoded.id ||
      decoded._id ||
      decoded.userId ||
      decoded.sub
    );

    if (!req.userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};
