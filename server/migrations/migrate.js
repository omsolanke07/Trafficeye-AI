
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const runMigrations = () => {
  console.log('[Migrate] Checking database migrations...');

  // Create migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = db.prepare('SELECT filename FROM _migrations').all().map(m => m.filename);
  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (!applied.includes(file)) {
      console.log(`[Migrate] Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(__dirname, file), 'utf-8');
      
      const applyTx = db.transaction(() => {
        db.exec(sql);
        db.prepare("INSERT INTO _migrations (filename, applied_at) VALUES (?, datetime('now'))").run(file);
      });

      applyTx();
      console.log(`[Migrate] Successfully applied: ${file}`);
    }
  }

  console.log('[Migrate] All migrations are up to date.');
};

// If run directly from CLI
if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  runMigrations();
  process.exit(0);
}
