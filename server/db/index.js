import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

// Ensure data directories exist
const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(config.reportsDir)) {
  fs.mkdirSync(config.reportsDir, { recursive: true });
}
if (!fs.existsSync(config.snapshotsDir)) {
  fs.mkdirSync(config.snapshotsDir, { recursive: true });
}
if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

// Open SQLite Database
export const db = new Database(config.dbPath);

// Enable WAL mode for high concurrency (readers don't block writers, writers don't block readers)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Serialized write queue to prevent SQLite lock contention between simulator & HTTP requests
let writeQueue = Promise.resolve();

export const executeWrite = (callback) => {
  return new Promise((resolve, reject) => {
    writeQueue = writeQueue.then(() => {
      try {
        const result = callback(db);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
};
