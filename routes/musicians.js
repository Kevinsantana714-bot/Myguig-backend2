const express = require('express');
const { pool }        = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function parseMusician(row) {
  return {
    id:           row.id,
    name:         row.name,
    bio:          row.bio || '',
    estilos:      JSON.parse(row.estilos || '[]'),
    instagram:    row.instagram || '',
    cache_minimo: parseFloat(row.cache_minimo || 0).toFixed(2),
    cidade:       row.cidade || '',
    avatar_url:   row.avatar_url || null,
  };
}

// GET /api/musicians?search=&style=&cidade=&page=1&limit=12
router.get('/', requireAuth, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const style  = (req.query.style  || '').trim();
    const cidade = (req.query.cidade || '').trim();

    // Exclui sempre o próprio utilizador autenticado dos resultados
    const conditions = [`role = 'musician'`, `id != $1`];
    const params     = [req.userId];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR bio ILIKE $${params.length})`);
    }
    if (style) {
      params.push(`%${style}%`);
      conditions.push(`estilos ILIKE $${params.length}`);
    }
    if (cidade) {
      params.push(`%${cidade}%`);
      conditions.push(`cidade ILIKE $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM users WHERE ${where}`,
      params
    );
    const rowsRes = await pool.query(
      `SELECT id, name, bio, estilos, instagram, cache_minimo, cidade, avatar_url
         FROM users WHERE ${where}
         ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      data:       rowsRes.rows.map(parseMusician),
      pagination: { page, limit, total: totalRes.rows[0].total },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
