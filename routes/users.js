const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /api/users/:id  — perfil público (sem autenticação)
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    const { rows } = await pool.query(
      `SELECT id, name, role, bio, estilos, instagram, cache_minimo, cidade, avatar_url, phone
         FROM users WHERE id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilizador não encontrado.' });

    const u = rows[0];

    // Contar shows confirmados como músico
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM proposals
         WHERE musician_id = $1 AND status = 'confirmed'`,
      [id]
    );

    res.json({
      user: {
        id:             u.id,
        name:           u.name,
        role:           u.role,
        bio:            u.bio || '',
        estilos:        JSON.parse(u.estilos || '[]'),
        instagram:      u.instagram || '',
        cache_minimo:   parseFloat(u.cache_minimo || 0).toFixed(2),
        cidade:         u.cidade || '',
        avatar_url:     u.avatar_url || null,
        phone:          u.phone || '',
        shows_confirmed: count,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
