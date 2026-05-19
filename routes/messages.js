const express = require('express');
const { pool }        = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/conversations
// Cria conversa entre req.userId e user_b_id.
// Se já existir conversa sem proposta entre os dois, devolve a existente.
router.post('/conversations', requireAuth, async (req, res) => {
  try {
    const user_b_id = parseInt((req.body || {}).user_b_id);
    if (!user_b_id) return res.status(400).json({ error: 'user_b_id é obrigatório.' });

    const user_a_id = req.userId;

    const { rows: existing } = await pool.query(
      `SELECT id FROM conversations
       WHERE proposal_id IS NULL
         AND ((user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1))
       LIMIT 1`,
      [user_a_id, user_b_id]
    );
    if (existing.length) return res.json({ conversation_id: existing[0].id });

    const { rows: [conv] } = await pool.query(
      'INSERT INTO conversations (user_a_id, user_b_id) VALUES ($1,$2) RETURNING id',
      [user_a_id, user_b_id]
    );
    res.status(201).json({ conversation_id: conv.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/conversations
// Lista todas as conversas onde o utilizador é participante.
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const uid = req.userId;

    const { rows: convs } = await pool.query(
      `SELECT c.*,
         CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END AS other_id
       FROM conversations c
       WHERE c.user_a_id = $1 OR c.user_b_id = $1
       ORDER BY c.created_at DESC`,
      [uid]
    );

    const data = await Promise.all(convs.map(async (c) => {
      const { rows: [other] }   = await pool.query('SELECT id, name FROM users WHERE id = $1', [c.other_id]);
      const { rows: [lastMsg] } = await pool.query(
        'SELECT body, created_at FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 1',
        [c.id]
      );
      const { rows: [ur] } = await pool.query(
        'SELECT COUNT(*)::int AS c FROM messages WHERE conversation_id = $1 AND sender_id != $2 AND read = 0',
        [c.id, uid]
      );

      return {
        id:              c.id,
        other_user:      other ? { id: other.id, name: other.name } : null,
        proposal_id:     c.proposal_id || null,
        last_message:    lastMsg ? lastMsg.body : null,
        last_message_at: lastMsg ? lastMsg.created_at : c.created_at,
        unread_count:    ur.c,
      };
    }));

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/conversations/:id/messages
// Devolve todas as mensagens e marca as do outro como lidas.
router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const conv_id = parseInt(req.params.id);
    const uid     = req.userId;

    const { rows: [conv] } = await pool.query('SELECT * FROM conversations WHERE id = $1', [conv_id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    if (conv.user_a_id !== uid && conv.user_b_id !== uid)
      return res.status(403).json({ error: 'Sem acesso a esta conversa.' });

    // Marca mensagens do outro como lidas
    await pool.query(
      'UPDATE messages SET read = 1 WHERE conversation_id = $1 AND sender_id != $2 AND read = 0',
      [conv_id, uid]
    );

    const { rows: messages } = await pool.query(
      'SELECT id, sender_id, body, read, created_at FROM messages WHERE conversation_id = $1 ORDER BY id ASC',
      [conv_id]
    );

    res.json({ data: messages });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/conversations/:id/messages
// Insere mensagem e notifica o outro participante.
router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const conv_id = parseInt(req.params.id);
    const uid     = req.userId;
    const body    = ((req.body || {}).body || '').trim();

    if (!body) return res.status(400).json({ error: 'body é obrigatório.' });

    const { rows: [conv] } = await pool.query('SELECT * FROM conversations WHERE id = $1', [conv_id]);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    if (conv.user_a_id !== uid && conv.user_b_id !== uid)
      return res.status(403).json({ error: 'Sem acesso a esta conversa.' });

    const { rows: [msg] } = await pool.query(
      'INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1,$2,$3) RETURNING id',
      [conv_id, uid, body]
    );

    // Notificação para o outro participante
    const other_id = conv.user_a_id === uid ? conv.user_b_id : conv.user_a_id;
    const { rows: [sender] } = await pool.query('SELECT name FROM users WHERE id = $1', [uid]);
    await pool.query(
      'INSERT INTO notifications (user_id, message) VALUES ($1,$2)',
      [other_id, `Nova mensagem de ${sender ? sender.name : 'alguém'}`]
    );

    res.status(201).json({ ok: true, message_id: msg.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/conversations/:id
// Apaga a conversa e todas as suas mensagens.
// Só participante da conversa pode apagar.
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const conv_id = parseInt(req.params.id);
    const uid     = req.userId;

    const { rows: [conv] } = await pool.query(
      'SELECT * FROM conversations WHERE id = $1',
      [conv_id]
    );
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });
    if (conv.user_a_id !== uid && conv.user_b_id !== uid)
      return res.status(403).json({ error: 'Sem permissão para apagar esta conversa.' });

    await pool.query('DELETE FROM messages      WHERE conversation_id = $1', [conv_id]);
    await pool.query('DELETE FROM conversations WHERE id = $1',              [conv_id]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
