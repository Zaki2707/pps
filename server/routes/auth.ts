import { Router } from 'express';
import { pool } from '../lib/db.js';
import { createSession, hashToken, SESSION_COOKIE, verifyPassword } from '../lib/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const { rows } = await pool.query(`SELECT * FROM users WHERE username=$1 AND active=true`, [username]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }
  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE, session.raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: session.maxAgeMs,
    path: '/'
  });
  res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
});

authRouter.post('/logout', async (req, res) => {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (raw) await pool.query(`DELETE FROM sessions WHERE token_hash=$1`, [hashToken(raw)]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Belum login.' });
  res.json(req.user);
});
