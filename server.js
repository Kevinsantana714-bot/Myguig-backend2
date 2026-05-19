require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const { init, seed }    = require('./db');
const authRoutes         = require('./routes/auth');
const proposalsRoutes    = require('./routes/proposals');
const notificationsRoutes = require('./routes/notifications');
const musiciansRoutes    = require('./routes/musicians');
const usersRoutes        = require('./routes/users');
const sendProposalRoutes = require('./routes/send_proposal');
const messagesRoutes     = require('./routes/messages');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json());

app.use('/auth',              authRoutes);
app.use('/api/proposals',     proposalsRoutes);
app.use('/api/proposals',     sendProposalRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/musicians',     musiciansRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api',               messagesRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

init().then(seed).then(() => {
  app.listen(PORT, () => {
    console.log(`\nMyGUIg backend rodando em http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Erro no seed:', err);
  process.exit(1);
});
