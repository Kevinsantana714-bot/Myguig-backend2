const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/stats
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [users, byRole, proposals, byStatus, newUsers7d] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM users'),
      pool.query('SELECT role, COUNT(*)::int AS total FROM users GROUP BY role'),
      pool.query('SELECT COUNT(*)::int AS total FROM proposals'),
      pool.query('SELECT status, COUNT(*)::int AS total FROM proposals GROUP BY status'),
      pool.query("SELECT COUNT(*)::int AS total FROM users WHERE created_at >= NOW() - INTERVAL '7 days'"),
    ]);
    res.json({
      total_users:         users.rows[0].total,
      users_by_role:       byRole.rows,
      total_proposals:     proposals.rows[0].total,
      proposals_by_status: byStatus.rows,
      new_users_7d:        newUsers7d.rows[0].total,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/users
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, created_at, onboarding_complete FROM users ORDER BY created_at DESC LIMIT 200'
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
