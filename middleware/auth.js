const jwt = require('jsonwebtoken');
const { pool } = require('../db');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
    if (!rows.length || !rows[0].is_admin) {
      return res.status(403).json({ error: 'Acesso restrito a administradores.' });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { requireAuth, requireAdmin };
