require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const session  = require('express-session');
const passport = require('./config/passport');

const { init, seed }    = require('./db');
const authRoutes         = require('./routes/auth');
const proposalsRoutes    = require('./routes/proposals');
const notificationsRoutes = require('./routes/notifications');
const musiciansRoutes    = require('./routes/musicians');
const usersRoutes        = require('./routes/users');
const sendProposalRoutes = require('./routes/send_proposal');
const messagesRoutes     = require('./routes/messages');
const eventsRoutes       = require('./routes/events');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json());

// Sessão mínima necessária para passport (não usamos sessões com estado — JWT é o mecanismo principal)
app.use(session({
  secret:            process.env.JWT_SECRET || 'myguig-session-secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: process.env.NODE_ENV === 'production', maxAge: 5 * 60 * 1000 }, // 5 min — só para o handshake OAuth
}));
app.use(passport.initialize());

app.use('/auth',              authRoutes);
app.use('/api/auth',          authRoutes); // alias para o callback do Google OAuth (/api/auth/google/callback)
app.use('/api/proposals',     proposalsRoutes);
app.use('/api/proposals',     sendProposalRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/musicians',     musiciansRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api',               messagesRoutes);
app.use('/api/events',        eventsRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));


// Diagnóstico temporário — confirma se as credenciais Cloudinary estão no ambiente
app.get('/health/cloudinary', async (_, res) => {
  try {
    const cloudinary = require('./config/cloudinary');
    const result = await cloudinary.api.ping();
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error:      e.message || String(e),
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'SET' : 'MISSING',
      api_key:    process.env.CLOUDINARY_API_KEY    ? 'SET' : 'MISSING',
      api_secret: process.env.CLOUDINARY_API_SECRET ? 'SET' : 'MISSING',
    });
  }
});

// Captura todos os erros não tratados e devolve JSON (evita páginas HTML 500)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[global error handler]', err.message || err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

init().then(seed).then(() => {
  app.listen(PORT, () => {
    console.log(`\nMyGUIg backend rodando em http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Erro no seed:', err);
  process.exit(1);
});
