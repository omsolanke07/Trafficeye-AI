import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('server/data/trafficeye.db');
const db = new Database(dbPath);

console.log('Connected to database:', dbPath);

// 1. Update common vehicle sightings (IDs 142-146) to MH 12 JJ 97
const updateDetections = db.prepare(`
  UPDATE detections
  SET plate_number = 'MH 12 JJ 97'
  WHERE id IN (142, 143, 144, 145, 146)
`).run();
console.log(`Updated common detections to 'MH 12 JJ 97': ${updateDetections.changes} rows.`);

// 2. Also update cameras' last_plate
db.prepare(`UPDATE cameras SET last_plate = 'MH 12 JJ 97'`).run();

const verified = db.prepare(`
  SELECT id, timestamp, camera_id, plate_number, ocr_confidence
  FROM detections
  WHERE id IN (142, 143, 144, 145, 146)
  ORDER BY timestamp ASC
`).all();

console.log('\nVerified Sightings for MH 12 JJ 97:');
console.table(verified);
