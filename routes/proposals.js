const express = require('express');
const { pool }        = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function normalize(row) {
  const [countersRes, contractorRes, musicianRes] = await Promise.all([
    pool.query(
      'SELECT author_id, novo_cache, novo_horario, mensagem FROM counters WHERE proposal_id = $1 ORDER BY id DESC LIMIT 1',
      [row.id]
    ),
    pool.query('SELECT name FROM users WHERE id = $1', [row.contractor_id]),
    pool.query('SELECT name FROM users WHERE id = $1', [row.musician_id]),
  ]);

  const lastCounter = countersRes.rows[0] || null;
  const contractor  = contractorRes.rows[0] || null;
  const musician    = musicianRes.rows[0]   || null;

  return {
    id:             row.id,
    contractor_id:  row.contractor_id,
    musician_id:    row.musician_id,
    data_iso:       row.data_iso,
    evento:         row.evento,
    local:          row.local,
    cache:          parseFloat(row.cache).toFixed(2),
    horario_inicio: row.horario_inicio,
    status:         row.status,
    estilos:        JSON.parse(row.estilos || '[]'),
    repertorio:     row.repertorio,
    metodo:         row.metodo,
    descricao:      row.descricao,
    contractor:     { name: contractor ? contractor.name : '' },
    musician:       { name: musician   ? musician.name   : '' },
    lastCounter:    lastCounter
      ? {
          author_id:   lastCounter.author_id,
          novo_cache:  lastCounter.novo_cache,
          novo_horario: lastCounter.novo_horario,
          mensagem:    lastCounter.mensagem,
        }
      : null,
  };
}

// POST /api/proposals  (contratante envia proposta a músico)
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      musician_id, evento, data_iso, local, cache,
      horario_inicio, estilos, repertorio, metodo, descricao,
    } = req.body || {};

    if (!musician_id || !evento || !data_iso || !local || cache == null)
      return res.status(400).json({ error: 'musician_id, evento, data_iso, local e cache são obrigatórios.' });

    const contractor_id = req.userId;

    // 1. Inserir proposta
    const { rows: [prop] } = await pool.query(
      `INSERT INTO proposals
         (contractor_id, musician_id, evento, data_iso, horario_inicio,
          local, cache, estilos, repertorio, metodo, descricao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        contractor_id, parseInt(musician_id), evento, data_iso,
        horario_inicio || null, local, parseFloat(cache),
        JSON.stringify(estilos || []),
        repertorio || null, metodo || null, descricao || null,
      ]
    );
    const proposal_id = prop.id;

    // 2. Notificação para o músico
    await pool.query(
      'INSERT INTO notifications (user_id, message) VALUES ($1,$2)',
      [parseInt(musician_id), `Nova proposta recebida: ${evento}`]
    );

    // 3. Conversa (só se não existir para esta proposta)
    const { rows: existing } = await pool.query(
      'SELECT id FROM conversations WHERE proposal_id = $1', [proposal_id]
    );
    let conversation_id;
    if (existing.length) {
      conversation_id = existing[0].id;
    } else {
      const { rows: [conv] } = await pool.query(
        'INSERT INTO conversations (user_a_id, user_b_id, proposal_id) VALUES ($1,$2,$3) RETURNING id',
        [contractor_id, parseInt(musician_id), proposal_id]
      );
      conversation_id = conv.id;

      // 4. Primeira mensagem automática
      await pool.query(
        'INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1,$2,$3)',
        [conversation_id, contractor_id,
         `📋 Proposta enviada: ${evento} em ${data_iso}. Cachê: R$ ${parseFloat(cache).toFixed(2)}`]
      );
    }

    res.status(201).json({ ok: true, proposal_id, conversation_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/proposals
router.get('/', requireAuth, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const status = req.query.status;
    const uid    = req.userId;
    const offset = (page - 1) * limit;

    // Retorna propostas onde o utilizador é músico OU contratante
    let totalRes, rowsRes;
    if (status && status !== 'all') {
      totalRes = await pool.query(
        'SELECT COUNT(*)::int AS total FROM proposals WHERE (musician_id = $1 OR contractor_id = $1) AND status = $2',
        [uid, status]
      );
      rowsRes = await pool.query(
        'SELECT * FROM proposals WHERE (musician_id = $1 OR contractor_id = $1) AND status = $2 ORDER BY data_iso ASC LIMIT $3 OFFSET $4',
        [uid, status, limit, offset]
      );
    } else {
      totalRes = await pool.query(
        'SELECT COUNT(*)::int AS total FROM proposals WHERE musician_id = $1 OR contractor_id = $1',
        [uid]
      );
      rowsRes = await pool.query(
        'SELECT * FROM proposals WHERE musician_id = $1 OR contractor_id = $1 ORDER BY data_iso ASC LIMIT $2 OFFSET $3',
        [uid, limit, offset]
      );
    }

    const total = totalRes.rows[0].total;
    const data  = await Promise.all(rowsRes.rows.map(normalize));

    res.json({ data, pagination: { page, limit, total } });
  } catch (e) {
    console.error('[GET /proposals] ERRO:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/proposals/:id/accept
router.patch('/:id/accept', requireAuth, async (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const uid = req.userId;

    const { rows: [prop] } = await pool.query(
      'SELECT id, contractor_id, musician_id, evento FROM proposals WHERE id = $1', [id]
    );
    if (!prop) return res.status(404).json({ error: 'Proposta não encontrada.' });

    await pool.query("UPDATE proposals SET status = 'confirmed', updated_at = NOW() WHERE id = $1", [id]);

    // Notificar o outro participante
    const otherId = uid === prop.musician_id ? prop.contractor_id : prop.musician_id;
    const { rows: [me] } = await pool.query('SELECT name FROM users WHERE id = $1', [uid]);
    const meName = me ? me.name : 'Utilizador';
    await pool.query(
      'INSERT INTO notifications (user_id, message) VALUES ($1, $2)',
      [otherId, `${meName} aceitou a proposta: ${prop.evento}`]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/proposals/:id/decline
router.patch('/:id/decline', requireAuth, async (req, res) => {
  try {
    const id     = parseInt(req.params.id);
    const reason = (req.body || {}).reason;
    if (!reason) return res.status(400).json({ error: 'reason é obrigatório.' });

    const { rows } = await pool.query('SELECT id FROM proposals WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Proposta não encontrada.' });

    await pool.query("UPDATE proposals SET status = 'declined', updated_at = NOW() WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/proposals/:id/counter
router.post('/:id/counter', requireAuth, async (req, res) => {
  try {
    const id       = parseInt(req.params.id);
    const senderId = req.userId;
    const { novo_cache, novo_horario, mensagem } = req.body || {};

    if (!novo_cache && !novo_horario && !mensagem)
      return res.status(400).json({ error: 'Preencha ao menos um campo.' });

    const { rows: [prop] } = await pool.query(
      'SELECT id, contractor_id, musician_id, evento FROM proposals WHERE id = $1', [id]
    );
    if (!prop) return res.status(404).json({ error: 'Proposta não encontrada.' });

    // Registar contraproposta
    await pool.query(
      'INSERT INTO counters (proposal_id, author_id, novo_cache, novo_horario, mensagem) VALUES ($1,$2,$3,$4,$5)',
      [id, senderId, novo_cache || null, novo_horario || null, mensagem || null]
    );
    await pool.query("UPDATE proposals SET status = 'negotiating', updated_at = NOW() WHERE id = $1", [id]);

    // Notificar o OUTRO participante
    const receiverId = senderId === prop.musician_id ? prop.contractor_id : prop.musician_id;
    const { rows: [sender] } = await pool.query('SELECT name FROM users WHERE id = $1', [senderId]);
    const senderName  = sender ? sender.name : 'Utilizador';
    const cacheStr    = novo_cache ? ` de € ${parseFloat(novo_cache).toFixed(2)}` : '';
    await pool.query(
      'INSERT INTO notifications (user_id, message) VALUES ($1, $2)',
      [receiverId, `${senderName} enviou uma contraproposta${cacheStr}: ${prop.evento}`]
    );

    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/proposals/:id/cancel
// Qualquer participante (músico ou contratante) pode cancelar e notifica o outro.
router.patch('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const uid = req.userId;

    const { rows: [prop] } = await pool.query(
      'SELECT id, contractor_id, musician_id, evento, data_iso FROM proposals WHERE id = $1',
      [id]
    );

    if (!prop) return res.status(404).json({ error: 'Proposta não encontrada.' });
    if (prop.musician_id !== uid && prop.contractor_id !== uid)
      return res.status(403).json({ error: 'Sem permissão para cancelar esta proposta.' });

    // Quem cancelou e quem recebe a notificação
    const otherId  = uid === prop.musician_id ? prop.contractor_id : prop.musician_id;
    const { rows: [canceller] } = await pool.query('SELECT name FROM users WHERE id = $1', [uid]);
    const cancellerName = canceller ? canceller.name : 'Utilizador';

    const dataStr = prop.data_iso
      ? (prop.data_iso instanceof Date
          ? prop.data_iso.toISOString().slice(0, 10)
          : String(prop.data_iso).slice(0, 10))
      : '';

    await pool.query(
      'INSERT INTO notifications (user_id, message) VALUES ($1, $2)',
      [otherId, `${cancellerName} cancelou o evento: ${prop.evento} em ${dataStr}`]
    );

    await pool.query(
      "UPDATE proposals SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [id]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
