import { pool } from './db.js';

export async function audit(userId: string | undefined, action: string, entityType?: string, entityId?: string, detail?: unknown) {
  await pool.query(
    `INSERT INTO audit_logs(user_id, action, entity_type, entity_id, detail)
     VALUES($1,$2,$3,$4,$5)`,
    [userId || null, action, entityType || null, entityId || null, detail ? JSON.stringify(detail) : null]
  );
}
