const express        = require('express');
const { pool }       = require('../db');
const { requireAuth} = require('../middleware/auth');
const upload         = require('../config/upload');
const uploadCover    = require('../config/uploadCover');

const router = express.Router();

// POST /api/users/avatar  — upload de foto para Cloudinary (autenticado)
// IMPORTANTE: deve vir antes de GET /:id para não ser capturado como id='avatar'
router.post('/avatar', requireAuth, (req, res, next) => {
  // Verificação antecipada das credenciais Cloudinary
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return res.status(503).json({ error: 'Serviço de upload não configurado. Contacte o administrador.' });
  }
  // Wrapping multer para que erros (Cloudinary, formato inválido, etc.)
  // sejam devolvidos como JSON em vez do HTML padrão do Express
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      const msg = err.message || (typeof err === 'string' ? err : JSON.stringify(err));
      console.error('[avatar upload] multer/cloudinary error:', msg, err);
      return res.status(500).json({ error: msg || 'Erro no upload. Verifica as credenciais Cloudinary.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });

    // multer-storage-cloudinary v4 coloca a URL pública em req.file.path
    const avatar_url = req.file.path;
    console.log('[avatar upload] cloudinary url:', avatar_url);

    await pool.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2',
      [avatar_url, req.userId]
    );

    res.json({ avatar_url });
  } catch (e) {
    console.error('[avatar upload] db error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users/cover  — upload de capa para Cloudinary (autenticado)
router.post('/cover', requireAuth, (req, res, next) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return res.status(503).json({ error: 'Serviço de upload não configurado. Contacte o administrador.' });
  }
  uploadCover.single('cover')(req, res, (err) => {
    if (err) {
      const msg = err.message || (typeof err === 'string' ? err : JSON.stringify(err));
      console.error('[cover upload] multer/cloudinary error:', msg, err);
      return res.status(500).json({ error: msg || 'Erro no upload. Verifica as credenciais Cloudinary.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado.' });
    const cover_url = req.file.path;
    await pool.query('UPDATE users SET cover_url = $1 WHERE id = $2', [cover_url, req.userId]);
    res.json({ cover_url });
  } catch (e) {
    console.error('[cover upload] db error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users/:id/availability?month=AAAA-MM  — datas ocupadas (sem autenticação)
router.get('/:id/availability', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month))
      return res.status(400).json({ error: 'Parâmetro month inválido. Use formato AAAA-MM.' });

    const [year, mon] = month.split('-').map(Number);
    const start  = `${year}-${String(mon).padStart(2,'0')}-01`;
    const lastD  = new Date(year, mon, 0).getDate();
    const end    = `${year}-${String(mon).padStart(2,'0')}-${String(lastD).padStart(2,'0')}`;

    const { rows: propRows } = await pool.query(
      `SELECT data_iso::text AS date FROM proposals
         WHERE musician_id = $1 AND status = 'confirmed'
           AND data_iso BETWEEN $2 AND $3`,
      [id, start, end]
    );
    const { rows: evtRows } = await pool.query(
      `SELECT date::text AS date FROM manual_events
         WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [id, start, end]
    );

    const all      = [...propRows, ...evtRows].map(r => r.date.slice(0, 10));
    const occupied = [...new Set(all)].sort();

    res.json({ occupied });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users/:id  — perfil público (sem autenticação)
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    const { rows } = await pool.query(
      `SELECT id, name, role, bio, estilos, instagram, cache_minimo, cidade, avatar_url, cover_url, phone, is_admin, deleted_at
         FROM users WHERE id = $1`,
      [id]
    );
    if (!rows.length || rows[0].is_admin || rows[0].deleted_at) return res.status(404).json({ error: 'Utilizador não encontrado.' });

    const u = rows[0];

    // Contar shows confirmados como músico
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM proposals
         WHERE musician_id = $1 AND status = 'confirmed'`,
      [id]
    );

    res.json({
      user: {
        id:              u.id,
        name:            u.name,
        role:            u.role,
        bio:             u.bio || '',
        estilos:         JSON.parse(u.estilos || '[]'),
        instagram:       u.instagram || '',
        cache_minimo:    parseFloat(u.cache_minimo || 0).toFixed(2),
        cidade:          u.cidade || '',
        avatar_url:      u.avatar_url  || null,
        cover_url:       u.cover_url   || null,
        phone:           u.phone || '',
        shows_confirmed: count,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
