const express        = require('express');
const { pool }       = require('../db');
const { requireAuth} = require('../middleware/auth');
const upload         = require('../config/upload');

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
        id:              u.id,
        name:            u.name,
        role:            u.role,
        bio:             u.bio || '',
        estilos:         JSON.parse(u.estilos || '[]'),
        instagram:       u.instagram || '',
        cache_minimo:    parseFloat(u.cache_minimo || 0).toFixed(2),
        cidade:          u.cidade || '',
        avatar_url:      u.avatar_url || null,
        phone:           u.phone || '',
        shows_confirmed: count,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
