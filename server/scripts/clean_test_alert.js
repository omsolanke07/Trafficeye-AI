import { db } from '../db/index.js';

db.prepare(`DELETE FROM alerts WHERE location LIKE '%Upload%' OR timestamp LIKE '%00:06:%'`).run();
db.prepare(`UPDATE blacklist SET last_seen_at = 'Aranyeshwar Circle, Pune · 20:48:56', last_seen_camera_id = 'CAM 04' WHERE plate_number = 'MH12SU1000'`).run();
console.log('Active alerts in DB:');
console.log(db.prepare('SELECT id, plate_number, alert_type, severity, location, timestamp FROM alerts').all());
