import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { pool } from './db.js';

const scryptAsync = promisify(crypto.scrypt);
export const SESSION_COOKIE = 'library_session';

type SessionUser = { id: string; username: string; name: string; role: 'admin' | 'librarian' };

declare global {
  namespace Express {
    interface Request { user?: SessionUser }
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltB64, hashB64] = stored.split('$');
  if (kind !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = (await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length)) as Buffer;
  return crypto.timingSafeEqual(expected, actual);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(raw);
  const days = Number(process.env.SESSION_DAYS || 7);
  await pool.query(
    `INSERT INTO sessions(user_id, token_hash, expires_at)
     VALUES($1,$2,now() + ($3 || ' days')::interval)`,
    [userId, tokenHash, days]
  );
  return { raw, maxAgeMs: days * 86400000 };
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = req.cookies?.[SESSION_COOKIE];
    if (!raw) return next();
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.name, u.role
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active=true`,
      [hashToken(raw)]
    );
    if (rows[0]) req.user = rows[0];
    next();
  } catch (e) { next(e); }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Silakan login.' });
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Silakan login.' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Akses admin diperlukan.' });
  next();
}
