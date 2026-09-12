import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../server/lib/db.js';
import { hashPassword } from '../server/lib/auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = await fs.readFile(path.resolve(here, '../db/schema.sql'), 'utf8');
await pool.query(schema);

const username = process.env.ADMIN_USER || 'admin';
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || 'Administrator';
if (!password) throw new Error('ADMIN_PASSWORD wajib diisi di .env sebelum db:init.');

const existing = await pool.query(`SELECT id FROM users WHERE username=$1`, [username]);
if (!existing.rows[0]) {
  await pool.query(`INSERT INTO users(username,password_hash,name,role) VALUES($1,$2,$3,'admin')`, [username, await hashPassword(password), name]);
  console.log(`Admin awal dibuat: ${username}`);
} else {
  console.log(`Admin ${username} sudah ada; tidak diubah.`);
}

console.log('Database siap.');
await pool.end();
