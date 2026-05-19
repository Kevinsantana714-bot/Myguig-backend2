const express = require('express');
const { pool }        = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const uid   = req.userId;

    const { rows: data } = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [uid, limit]
    );
    const { rows: [{ c }] } = await pool.query(
      'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND read = 0',
      [uid]
    );

    res.json({ data, unread_count: c });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/notifications/read-all  ← must be before /:id/read
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = 1 WHERE user_id = $1 AND read = 0', [req.userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query('UPDATE notifications SET read = 1 WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const uid = req.userId;

    const { rows: [notif] } = await pool.query(
      'SELECT id FROM notifications WHERE id = $1 AND user_id = $2',
      [id, uid]
    );
    if (!notif) return res.status(404).json({ error: 'Notificação não encontrada.' });

    await pool.query('DELETE FROM notifications WHERE id = $1', [id]);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
