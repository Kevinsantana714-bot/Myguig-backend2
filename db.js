require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcrypt');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Migrations ──────────────────────────────────────────────────────────────
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL      PRIMARY KEY,
      name          TEXT        NOT NULL,
      email         TEXT        NOT NULL UNIQUE,
      password_hash TEXT        NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id             SERIAL      PRIMARY KEY,
      contractor_id  INTEGER     NOT NULL REFERENCES users(id),
      musician_id    INTEGER     NOT NULL REFERENCES users(id),
      evento         TEXT        NOT NULL,
      data_iso       DATE        NOT NULL,
      horario_inicio TEXT,
      local          TEXT        NOT NULL,
      cache          NUMERIC     NOT NULL DEFAULT 0,
      status         TEXT        NOT NULL DEFAULT 'pending',
      estilos        TEXT        NOT NULL DEFAULT '[]',
      repertorio     TEXT,
      metodo         TEXT,
      descricao      TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS counters (
      id           SERIAL      PRIMARY KEY,
      proposal_id  INTEGER     NOT NULL REFERENCES proposals(id),
      author_id    INTEGER     NOT NULL REFERENCES users(id),
      novo_cache   NUMERIC,
      novo_horario TEXT,
      mensagem     TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL      PRIMARY KEY,
      user_id    INTEGER     NOT NULL REFERENCES users(id),
      message    TEXT        NOT NULL,
      read       INTEGER     NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id          SERIAL      PRIMARY KEY,
      user_a_id   INTEGER     NOT NULL REFERENCES users(id),
      user_b_id   INTEGER     NOT NULL REFERENCES users(id),
      proposal_id INTEGER     REFERENCES proposals(id),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              SERIAL      PRIMARY KEY,
      conversation_id INTEGER     NOT NULL REFERENCES conversations(id),
      sender_id       INTEGER     NOT NULL REFERENCES users(id),
      body            TEXT        NOT NULL,
      read            INTEGER     NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Profile columns added for discovery feature
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role         VARCHAR(20)    NOT NULL DEFAULT 'musician'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio          TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS estilos      TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram    VARCHAR(100)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cache_minimo NUMERIC(10,2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cidade       VARCHAR(100)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url   TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone        VARCHAR(30)`);

  console.log('DB inicializado — tabelas OK');
}

// ── Seed ────────────────────────────────────────────────────────────────────
async function seed() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM users');
  if (rows[0].c > 0) { console.log('Seed já existe, pulando'); return; }

  const hash = await bcrypt.hash('12345678', 10);

  const { rows: [pedro] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, bio, estilos, instagram, cache_minimo, cidade)
     VALUES ($1,$2,$3,'musician','Violonista e cantor com 10 anos de experiência em eventos corporativos e casamentos.',
             $4,'@pedroalvesmusica',1200,'São Paulo')
     RETURNING id`,
    ['Pedro Alves', 'pedro@test.com', hash, JSON.stringify(['MPB', 'Jazz', 'Bossa Nova'])]
  );
  const { rows: [silva] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, cidade)
     VALUES ($1,$2,$3,'contractor','São Paulo') RETURNING id`,
    ['Eventos Silva', 'silva@test.com', hash]
  );

  // Extra demo musicians
  const { rows: [carla] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, bio, estilos, instagram, cache_minimo, cidade)
     VALUES ($1,$2,$3,'musician','Cantora e multi-instrumentista especializada em Samba e Pagode. Atende festas, bares e eventos.',
             $4,'@carlamusicarj',800,'Rio de Janeiro') RETURNING id`,
    ['Carla Souza', 'carla@test.com', hash, JSON.stringify(['Samba', 'Pagode', 'Funk'])]
  );
  const { rows: [rafael] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, bio, estilos, instagram, cache_minimo, cidade)
     VALUES ($1,$2,$3,'musician','Guitarrista com passagem por festivais nacionais. Repertório de Rock clássico e Blues.',
             $4,'@rafaelrock',1500,'Belo Horizonte') RETURNING id`,
    ['Rafael Lima', 'rafael@test.com', hash, JSON.stringify(['Rock', 'Blues', 'Indie'])]
  );
  const { rows: [ana] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, bio, estilos, instagram, cache_minimo, cidade)
     VALUES ($1,$2,$3,'musician','Pianista clássica formada pela USP. Ideal para cerimônias, recitais e eventos de luxo.',
             $4,'@anapiano',2000,'Curitiba') RETURNING id`,
    ['Ana Ferreira', 'ana@test.com', hash, JSON.stringify(['Clássico', 'Erudito', 'Jazz'])]
  );

  const pedroId = pedro.id;
  const silvaId = silva.id;

  const props = [
    { ev: 'Show no Bar da Vila',     dt: '2026-08-15', hr: '20:30', lo: 'Bar da Vila — São Paulo, SP',    ca: 1500, st: 'pending',     es: ['MPB','Jazz'],           re: 'Clássicos do MPB e Jazz instrumental', me: 'Duo de violão e voz',      de: 'Evento para 150 pessoas, jantar corporativo.' },
    { ev: 'Casamento Jardim Europa', dt: '2026-09-20', hr: '17:00', lo: 'Espaço Jardim Europa, SP',       ca: 3000, st: 'pending',     es: ['Bossa Nova','Clássico'], re: '20 músicas — 90 min',                 me: 'Solo violão',              de: 'Cerimônia ao ar livre.' },
    { ev: 'Aniversário 50 anos',     dt: '2026-07-10', hr: '19:00', lo: 'Club Homs — São Paulo',          ca: 2000, st: 'confirmed',   es: ['MPB','Pop'],            re: '25 músicas — 2h',                     me: 'Trio com bateria e baixo', de: 'Festa íntima de 100 pessoas.' },
    { ev: 'Evento Corporativo Itaú', dt: '2026-07-25', hr: '20:00', lo: 'WTC — São Paulo',                ca: 4000, st: 'confirmed',   es: ['Jazz','Lounge'],        re: '30 músicas — 2h30',                   me: 'Quarteto',                 de: 'Jantar executivo.' },
    { ev: 'Festival de Verão',       dt: '2026-08-05', hr: '18:00', lo: 'Parque Ibirapuera — SP',         ca: 2500, st: 'negotiating', es: ['Rock','Blues'],         re: '20 músicas — 1h30',                   me: 'Banda completa',           de: 'Festival ao ar livre com 500 pessoas.' },
    { ev: 'Happy Hour Escritório',   dt: '2026-06-30', hr: '18:30', lo: 'Berrini Business Center',        ca: 800,  st: 'declined',    es: ['MPB'],                  re: '15 músicas — 1h',                     me: 'Solo voz e violão',        de: 'Evento interno de empresa.' },
  ];

  for (const p of props) {
    const { rows: [prop] } = await pool.query(
      `INSERT INTO proposals
         (contractor_id, musician_id, evento, data_iso, horario_inicio,
          local, cache, status, estilos, repertorio, metodo, descricao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [silvaId, pedroId, p.ev, p.dt, p.hr, p.lo, p.ca, p.st,
       JSON.stringify(p.es), p.re, p.me, p.de]
    );
    if (p.st === 'negotiating') {
      await pool.query(
        'INSERT INTO counters (proposal_id, author_id, novo_cache, mensagem) VALUES ($1,$2,$3,$4)',
        [prop.id, silvaId, 3000, 'Podemos aumentar para R$ 3.000 se incluir mais 30 min.']
      );
    }
  }

  await pool.query(
    'INSERT INTO notifications (user_id, message, read) VALUES ($1,$2,$3),($1,$4,$3),($1,$5,$6)',
    [pedroId,
     'Nova proposta recebida: Show no Bar da Vila',     0,
     'Nova proposta recebida: Casamento Jardim Europa',
     'Proposta confirmada: Aniversário 50 anos',        1]
  );

  console.log('Seed inserido');
}

module.exports = { pool, init, seed };
