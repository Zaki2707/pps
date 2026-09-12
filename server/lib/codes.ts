import type pg from 'pg';

function year() { return new Date().getFullYear(); }

export async function nextMemberCode(client: pg.PoolClient, type: 'student' | 'teacher') {
  const seq = type === 'student' ? 'student_member_seq' : 'teacher_member_seq';
  const prefix = type === 'student' ? 'STU' : 'TCH';
  const { rows } = await client.query(`SELECT nextval('${seq}') AS n`);
  return `${prefix}-${year()}-${String(rows[0].n).padStart(6, '0')}`;
}

export async function nextCopyCode(client: pg.PoolClient) {
  const { rows } = await client.query(`SELECT nextval('book_copy_seq') AS n`);
  return `BK-${year()}-${String(rows[0].n).padStart(6, '0')}`;
}

export function normalizeCode(value: string) {
  return value.trim().replace(/^ABS:/i, '').toUpperCase();
}
