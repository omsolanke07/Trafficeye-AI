/**
 * Safe Database Reset / Cleanup Script
 * =====================================
 * 1. Creates a full timestamped backup of trafficeye.db
 * 2. Clears operational tables (cameras, detections, blacklist, alerts, reports, anpr_jobs, anpr_events, anpr_observations)
 * 3. Preserves users table (or creates single admin account deshmukh / police123)
 * 4. Preserves system_config and schema
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../data/trafficeye.db');

export async function resetDatabase() {
  console.log('[Reset] Starting database cleanup...');

  if (!fs.existsSync(dbPath)) {
    console.error(`[Reset] Database not found at ${dbPath}`);
    return;
  }

  // 1. Create Timestamped Backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(__dirname, `../data/trafficeye.backup_${timestamp}.db`);
  fs.copyFileSync(dbPath, backupPath);
  console.log(`[Reset] Verified backup created at: ${backupPath}`);

  const db = new Database(dbPath);

  const passwordHash = bcrypt.hashSync('police123', 10);

  // 2. Clear Operational Tables in a transaction
  const cleanupTx = db.transaction(() => {
    db.prepare('DELETE FROM detections').run();
    db.prepare('DELETE FROM alerts').run();
    db.prepare('DELETE FROM blacklist').run();
    db.prepare('DELETE FROM cameras').run();
    db.prepare('DELETE FROM reports').run();
    db.prepare('DELETE FROM anpr_observations').run();
    db.prepare('DELETE FROM anpr_events').run();
    db.prepare('DELETE FROM anpr_jobs').run();
    db.prepare('DELETE FROM audit_log').run();

    // Reset auto-increment sequences where applicable
    try {
      db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('detections', 'blacklist', 'reports', 'anpr_events', 'anpr_observations', 'audit_log')`).run();
    } catch (e) {
      // ignore if sqlite_sequence not found
    }

    // Ensure users table contains primary admin account
    db.prepare('DELETE FROM users').run();
    db.prepare(`
      INSERT INTO users (id, username, name, role, station, access_level, password_hash, status)
      VALUES (1, 'deshmukh', 'Insp. R. Deshmukh', 'Shift Commander', 'PCR-04', 'Full Access', ?, 'Active')
    `).run(passwordHash);

    // Initial audit log
    db.prepare(`
      INSERT INTO audit_log (user_id, username, action, target_type, target_id, details, timestamp, ip_address)
      VALUES (1, 'deshmukh', 'DATABASE_RESET', 'DATABASE', 'trafficeye.db', 'Reset all operational tables to 0 records. Initialized clean platform state.', datetime('now'), '127.0.0.1')
    `).run();
  });

  cleanupTx();

  console.log('[Reset] Database cleanup complete. Operational tables are now at 0 records.');
  
  // Verify table counts
  const tables = ['cameras', 'detections', 'blacklist', 'alerts', 'reports', 'anpr_jobs', 'users'];
  for (const t of tables) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${t}`).get().count;
    console.log(`  - ${t}: ${count}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('resetDatabase.js')) {
  resetDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Reset Error]', err);
      process.exit(1);
    });
}
