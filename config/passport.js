const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool }       = require('../db');

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  'https://myguig-backend-production.up.railway.app/api/auth/google/callback',
  },
  async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email     = profile.emails?.[0]?.value?.toLowerCase();
      const name      = profile.displayName || profile.name?.givenName || 'Utilizador';
      const googleId  = profile.id;
      const avatarUrl = profile.photos?.[0]?.value || null;

      if (!email) return done(new Error('Google não devolveu email'), null);

      // 1. Verificar se já existe por google_id
      let { rows } = await pool.query(
        'SELECT * FROM users WHERE google_id = $1', [googleId]
      );

      if (rows.length) return done(null, rows[0]);

      // 2. Verificar se já existe por email (conta criada manualmente)
      ({ rows } = await pool.query(
        'SELECT * FROM users WHERE email = $1', [email]
      ));

      if (rows.length) {
        // Vincular google_id à conta existente e actualizar avatar se ainda não tem
        await pool.query(
          `UPDATE users SET google_id = $1, avatar_url = COALESCE(NULLIF(avatar_url,''), $2) WHERE id = $3`,
          [googleId, avatarUrl, rows[0].id]
        );
        return done(null, { ...rows[0], google_id: googleId });
      }

      // 3. Criar nova conta
      const { rows: [created] } = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, avatar_url, google_id)
         VALUES ($1, $2, NULL, 'musician', $3, $4) RETURNING *`,
        [name, email, avatarUrl, googleId]
      );
      return done(null, created);
    } catch (e) {
      return done(e, null);
    }
  }
));

// Passport só precisa de serializar/deserializar para sessões (não usamos sessões com estado, mas passport exige)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, rows[0] || null);
  } catch (e) {
    done(e, null);
  }
});

module.exports = passport;
