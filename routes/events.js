const express        = require('express');
const { pool }       = require('../db');
const { requireAuth} = require('../middleware/auth');

const router = express.Router();

// GET /api/events  — lista todos os eventos manuais do utilizador autenticado
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, date, time_start, time_end, location, value, description, created_at
         FROM manual_events
        WHERE user_id = $1
        ORDER BY date ASC, time_start ASC`,
      [req.userId]
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/events  — cria novo evento manual
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, date, time_start, time_end, location, value, description } = req.body;

    if (!title || !title.trim())  return res.status(400).json({ error: 'Título obrigatório.' });
    if (!date)                     return res.status(400).json({ error: 'Data obrigatória.' });

    const { rows: [ev] } = await pool.query(
      `INSERT INTO manual_events (user_id, title, date, time_start, time_end, location, value, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, date, time_start, time_end, location, value, description, created_at`,
      [
        req.userId,
        title.trim(),
        date,
        time_start  || null,
        time_end    || null,
        location    ? location.trim() : null,
        parseFloat(value) || 0,
        description ? description.trim() : null,
      ]
    );
    res.status(201).json({ event: ev });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/events/:id  — atualiza evento manual (só o próprio utilizador)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    const { title, date, time_start, time_end, location, value, description } = req.body;

    if (!title || !title.trim())  return res.status(400).json({ error: 'Título obrigatório.' });
    if (!date)                     return res.status(400).json({ error: 'Data obrigatória.' });

    const { rows } = await pool.query(
      `UPDATE manual_events
          SET title       = $1,
              date        = $2,
              time_start  = $3,
              time_end    = $4,
              location    = $5,
              value       = $6,
              description = $7
        WHERE id = $8 AND user_id = $9
        RETURNING id, title, date, time_start, time_end, location, value, description, created_at`,
      [
        title.trim(),
        date,
        time_start  || null,
        time_end    || null,
        location    ? location.trim() : null,
        parseFloat(value) || 0,
        description ? description.trim() : null,
        id,
        req.userId,
      ]
    );

    if (!rows.length) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json({ event: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/events/:id  — remove evento manual (só o próprio utilizador)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    const { rowCount } = await pool.query(
      'DELETE FROM manual_events WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (!rowCount) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
