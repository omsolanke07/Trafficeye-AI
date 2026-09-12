import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';

export const seedDatabase = async () => {
  console.log('[Seed] Checking database seeding...');

  // Check if admin user already seeded
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) {
    console.log('[Seed] Database authentication is already initialized.');
    return;
  }

  console.log('[Seed] Initializing primary administrative account...');

  const passwordHash = await bcrypt.hash('police123', 10);

  const seedTx = db.transaction(() => {
    // 1. Primary Administrator User Account (Required for Law Enforcement Auth)
    const insertUser = db.prepare(`
      INSERT INTO users (username, name, role, station, access_level, password_hash, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run('deshmukh', 'Insp. R. Deshmukh', 'Shift Commander', 'PCR-04', 'Full Access', passwordHash, 'Active');

    // 2. Baseline System Config
    const insertConfig = db.prepare(`INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)`);
    insertConfig.run('ocr_threshold', '85');
    insertConfig.run('sound_alerts', 'true');
    insertConfig.run('auto_dispatch', 'false');
    insertConfig.run('system_version', '4.2.1-gov');

    // 3. Initial Audit Record
    const insertAudit = db.prepare(`
      INSERT INTO audit_log (user_id, username, action, target_type, target_id, details, timestamp, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);
    insertAudit.run(1, 'deshmukh', 'SYSTEM_INITIALIZATION', 'DATABASE', 'trafficeye.db', 'Initialized clean platform schema and admin auth', '127.0.0.1');
  });

  seedTx();
  console.log('[Seed] Database seeding completed successfully.');
};

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase();
  process.exit(0);
}
