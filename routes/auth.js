const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { pool }        = require('../db');
const { requireAuth } = require('../middleware/auth');
const mailer          = require('../config/mailer');

const router      = express.Router();
const SALT_ROUNDS = 10;

function makeToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email e password são obrigatórios.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });

    const validRoles = ['musician', 'contractor'];
    const userRole = validRoles.includes(role) ? role : 'musician';

    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (rows.length) return res.status(400).json({ error: 'E-mail já cadastrado.' });

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows: [created] } = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name.trim(), email.trim().toLowerCase(), password_hash, userRole]
    );

    res.status(201).json({ token: makeToken(created), user: { id: created.id, name: created.name, email: created.email, role: created.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: 'email e password são obrigatórios.' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const row   = rows[0];
    const valid = row && await bcrypt.compare(password, row.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas.' });

    res.json({ token: makeToken(row), user: { id: row.id, name: row.name, email: row.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /auth/logout
router.post('/logout', requireAuth, (_req, res) => res.json({ ok: true }));

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, bio, estilos, instagram, cache_minimo, cidade, avatar_url, phone FROM users WHERE id = $1',
      [req.userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'Usuário não encontrado.' });
    const u = rows[0];
    res.json({ user: { ...u, estilos: JSON.parse(u.estilos || '[]') } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /auth/profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, bio, estilos, instagram, cache_minimo, cidade, avatar_url, phone } = req.body || {};

    const { rows } = await pool.query(
      `UPDATE users
         SET name         = COALESCE($1, name),
             bio          = COALESCE($2, bio),
             estilos      = COALESCE($3, estilos),
             instagram    = COALESCE($4, instagram),
             cache_minimo = COALESCE($5, cache_minimo),
             cidade       = COALESCE($6, cidade),
             avatar_url   = COALESCE($8, avatar_url),
             phone        = COALESCE($9, phone)
         WHERE id = $7
         RETURNING id, name, email, role, bio, estilos, instagram, cache_minimo, cidade, avatar_url, phone`,
      [
        name      ? name.trim()                   : null,
        bio       ? bio.trim()                    : null,
        estilos !== undefined ? JSON.stringify(estilos) : null,
        instagram ? instagram.trim()              : null,
        cache_minimo != null ? parseFloat(cache_minimo) : null,
        cidade    ? cidade.trim()                 : null,
        req.userId,
        avatar_url ? avatar_url.trim()            : null,
        phone      ? phone.trim()                 : null,
      ]
    );

    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const u = rows[0];
    res.json({ user: { ...u, estilos: JSON.parse(u.estilos || '[]') } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /auth/forgot-password  — gera código de 6 dígitos, válido 15 min
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email é obrigatório.' });

    const { rows } = await pool.query(
      'SELECT id, name FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    // Sempre retorna 200 — não revelar se o email existe ou não
    if (!rows.length) return res.json({ ok: true });

    const user    = rows[0];
    const code    = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
    const expires = new Date(Date.now() + 15 * 60 * 1000);               // +15 minutos

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [code, expires, user.id]
    );

    await mailer.emails.send({
      from:    'MyGUIG <noreply@myguig.com>',
      to:      [email.trim().toLowerCase()],
      subject: 'O teu código de recuperação — MyGUIG',
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;">
          <h2 style="margin:0 0 8px">Recuperação de senha</h2>
          <p style="margin:0 0 16px;color:#444">O teu código de verificação é:</p>
          <h1 style="letter-spacing:8px;color:#7c3aed;margin:0 0 16px">${code}</h1>
          <p style="margin:0 0 8px;color:#444">Válido por 15 minutos.</p>
          <p style="color:#888;font-size:13px">Se não pediste isto, ignora este email.</p>
        </div>
      `,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('[forgot-password]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /auth/reset-password  — verifica email + código + define nova senha
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, new_password } = req.body || {};
    if (!email)        return res.status(400).json({ error: 'email é obrigatório.' });
    if (!code)         return res.status(400).json({ error: 'code é obrigatório.' });
    if (!new_password) return res.status(400).json({ error: 'new_password é obrigatório.' });
    if (new_password.length < 8)
      return res.status(400).json({ error: 'A senha deve ter ao menos 8 caracteres.' });

    const { rows } = await pool.query(
      `SELECT id FROM users
        WHERE email = $1
          AND reset_token = $2
          AND reset_token_expires > NOW()`,
      [email.trim().toLowerCase(), String(code).trim()]
    );
    if (!rows.length)
      return res.status(400).json({ error: 'Código inválido ou expirado. Solicita um novo código.' });

    const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [password_hash, rows[0].id]
    );

    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (e) {
    console.error('[reset-password]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
