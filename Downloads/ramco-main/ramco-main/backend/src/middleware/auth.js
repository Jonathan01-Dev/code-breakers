const jwt = require('jsonwebtoken');
const { passwordChangedAt } = require('../resetTokens');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    passwordChangedAt(payload.id)
      .then((changed) => {
        if (changed && payload.iat * 1000 < new Date(changed).getTime() - 2000) {
          return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
        }
        req.user = payload;
        next();
      })
      .catch(() => {
        req.user = payload;
        next();
      });
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
