import { pool } from '../lib/db.js';
import { normalizeCode } from '../lib/codes.js';

export async function findMemberByCode(rawCode: string) {
  const code = normalizeCode(rawCode);
  if (code.startsWith('STU-')) {
    const { rows } = await pool.query(
      `SELECT s.id, s.member_code, s.name, s.photo_url, s.status,
              c.name AS class_name, ay.label AS academic_year
       FROM students s
       LEFT JOIN student_enrollments se ON se.student_id=s.id
       LEFT JOIN academic_years ay ON ay.id=se.academic_year_id AND ay.is_active=true
       LEFT JOIN classes c ON c.id=se.class_id
       WHERE s.member_code=$1
       ORDER BY ay.is_active DESC NULLS LAST LIMIT 1`, [code]);
    return rows[0] ? { type: 'student' as const, ...rows[0] } : null;
  }
  if (code.startsWith('TCH-')) {
    const { rows } = await pool.query(
      `SELECT id, member_code, name, photo_url, status FROM teachers WHERE member_code=$1`, [code]);
    return rows[0] ? { type: 'teacher' as const, class_name: null, academic_year: null, ...rows[0] } : null;
  }
  return null;
}
