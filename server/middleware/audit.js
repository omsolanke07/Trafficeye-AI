import { executeWrite } from '../db/index.js';

export const logAudit = async ({ userId, username, action, targetType, targetId, details, ipAddress }) => {
  try {
    await executeWrite((database) => {
      const stmt = database.prepare(`
        INSERT INTO audit_log (user_id, username, action, target_type, target_id, details, timestamp, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `);
      stmt.run(
        userId || null,
        username || 'SYSTEM',
        action,
        targetType,
        targetId ? String(targetId) : null,
        details ? String(details) : null,
        ipAddress || '127.0.0.1'
      );
    });
  } catch (err) {
    console.error('[Audit] Failed to record audit log:', err.message);
  }
};
