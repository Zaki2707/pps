import { Router } from 'express';
import { pool } from '../lib/db.js';
import { findMemberByCode } from '../services/members.js';
import { normalizeCode } from '../lib/codes.js';

export const publicRouter = Router();

publicRouter.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit || 30), 50);
  const params: unknown[] = [];
  let where = '';
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE b.title ILIKE $1 OR COALESCE(b.author_text,'') ILIKE $1 OR COALESCE(b.isbn,'') ILIKE $1 OR COALESCE(c.name,'') ILIKE $1`;
  }
  params.push(limit);
  const limitPos = params.length;
  const { rows } = await pool.query(
    `SELECT b.id, b.isbn, b.title, b.subtitle, b.author_text, b.publisher, b.publication_year,
            b.cover_url, c.name AS category, s.code AS shelf_code, s.name AS shelf_name,
            COUNT(bc.id)::int AS total,
            COUNT(bc.id) FILTER (WHERE bc.status='available')::int AS available,
            COUNT(bc.id) FILTER (WHERE bc.status='borrowed')::int AS borrowed,
            COUNT(bc.id) FILTER (WHERE bc.status='damaged')::int AS damaged
     FROM books b
     LEFT JOIN categories c ON c.id=b.category_id
     LEFT JOIN shelves s ON s.id=b.shelf_id
     LEFT JOIN book_copies bc ON bc.book_id=b.id AND bc.status <> 'withdrawn'
     ${where}
     GROUP BY b.id,c.name,s.code,s.name
     ORDER BY ${q ? `CASE WHEN lower(b.title)=lower($1::text) THEN 0 WHEN b.title ILIKE $1 THEN 1 ELSE 2 END,` : ''} b.title
     LIMIT $${limitPos}`,
    params
  );
  res.json(rows);
});

publicRouter.get('/books/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*, c.name AS category, s.code AS shelf_code, s.name AS shelf_name,
            COUNT(bc.id)::int AS total,
            COUNT(bc.id) FILTER (WHERE bc.status='available')::int AS available,
            COUNT(bc.id) FILTER (WHERE bc.status='borrowed')::int AS borrowed,
            COUNT(bc.id) FILTER (WHERE bc.status='damaged')::int AS damaged,
            COUNT(bc.id) FILTER (WHERE bc.status='lost')::int AS lost
     FROM books b
     LEFT JOIN categories c ON c.id=b.category_id
     LEFT JOIN shelves s ON s.id=b.shelf_id
     LEFT JOIN book_copies bc ON bc.book_id=b.id AND bc.status <> 'withdrawn'
     WHERE b.id=$1
     GROUP BY b.id,c.name,s.code,s.name`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Buku tidak ditemukan.' });
  res.json(rows[0]);
});

publicRouter.post('/visit-scan', async (req, res) => {
  const code = normalizeCode(String(req.body?.code || ''));
  const member = await findMemberByCode(code);
  if (!member || member.status !== 'active') return res.status(404).json({ ok: false, error: 'Kartu anggota tidak aktif atau tidak ditemukan.' });

  const cooldownResult = await pool.query(`SELECT COALESCE((value #>> '{}')::int,30) AS minutes FROM library_settings WHERE key='visit_cooldown_minutes'`);
  const cooldown = cooldownResult.rows[0]?.minutes || 30;
  const recent = await pool.query(
    `SELECT scanned_at FROM library_visits
     WHERE member_type=$1 AND member_id=$2 AND scanned_at > now() - ($3 || ' minutes')::interval
     ORDER BY scanned_at DESC LIMIT 1`, [member.type, member.id, cooldown]);

  if (recent.rows[0]) {
    return res.json({ ok: true, duplicate: true, member: { name: member.name, className: member.class_name } });
  }

  const allowedSources = new Set(['usb','camera','mobile','manual','kiosk']);
  const requestedSource = String(req.body?.source || 'kiosk').toLowerCase();
  const source = allowedSources.has(requestedSource) ? requestedSource : 'kiosk';
  const deviceId = String(req.body?.deviceId || 'kiosk-main').slice(0, 120);

  await pool.query(
    `INSERT INTO library_visits(member_type, member_id, device_id, source)
     VALUES($1,$2,$3,$4)`, [member.type, member.id, deviceId, source]);
  res.json({ ok: true, duplicate: false, member: { name: member.name, className: member.class_name } });
});

publicRouter.get('/visit-count-today', async (_req, res) => {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM library_visits WHERE scanned_at::date = CURRENT_DATE`);
  res.json({ count: rows[0].count });
});
