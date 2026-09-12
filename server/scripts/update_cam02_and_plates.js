import { db } from '../db/index.js';

console.log('[Migration] Updating PVG camera to CAM02 and inserting 7 HSRP vehicles...');

// 1. Disable foreign keys temporarily for atomic migration
db.pragma('foreign_keys = OFF');

const existingPvg = db.prepare("SELECT * FROM cameras WHERE id = 'CAM-GATE-01' OR name LIKE '%PVG%'").get();

if (existingPvg) {
  // Insert CAM02 if not present
  db.prepare(`
    INSERT OR REPLACE INTO cameras (id, name, ward, sector, lat, lng, ip_address, fps, resolution, status, last_plate, last_seen, source_type, source_url, location)
    VALUES ('CAM02', 'CAM02', ?, ?, ?, ?, ?, ?, ?, 'online', 'MH12PZ5922', '19:56:40', 'video_file', '/videos/pvg_college.mp4', 'CAM02 - PVG Entrance Node')
  `).run(
    existingPvg.ward || 'Parvati / Swargate',
    existingPvg.sector || 'Sector 4',
    existingPvg.lat || 18.490428,
    existingPvg.lng || 73.854266,
    existingPvg.ip_address || '127.0.0.1',
    existingPvg.fps || 30,
    existingPvg.resolution || '1080p'
  );

  // Re-link detections
  const updateDetCam = db.prepare(`
    UPDATE detections
    SET camera_id = 'CAM02'
    WHERE camera_id = 'CAM-GATE-01'
  `).run();
  console.log('Updated detections referencing CAM02:', updateDetCam.changes);

  // Clean up old CAM-GATE-01
  db.prepare("DELETE FROM cameras WHERE id = 'CAM-GATE-01'").run();
  console.log('Cleaned up old CAM-GATE-01 camera row.');
}

db.pragma('foreign_keys = ON');

// 3. Vehicles to add:
const newVehicles = [
  { plate: 'MH12NP5908', cam: 'CAM02', time: '19:15:22', conf: 0.985, cond: 'Clear' },
  { plate: 'MH12YH7827', cam: 'CAM 01', time: '19:22:45', conf: 0.962, cond: 'Clear' },
  { plate: 'MH12VS4661', cam: 'CAM 03', time: '19:31:10', conf: 0.978, cond: 'Clear' },
  { plate: 'MH12VP1228', cam: 'CAM02', time: '19:38:05', conf: 0.954, cond: 'Clear' },
  { plate: 'MH12YO6177', cam: 'CAM 04', time: '19:44:30', conf: 0.991, cond: 'Clear' },
  { plate: 'MH12JS5588', cam: 'CAM 05', time: '19:50:18', conf: 0.972, cond: 'Clear' },
  { plate: 'MH12PZ5922', cam: 'CAM02', time: '19:56:40', conf: 0.988, cond: 'Clear' }
];

const insertStmt = db.prepare(`
  INSERT INTO detections (timestamp, camera_id, plate_number, ocr_confidence, detection_confidence, condition, source_type, status)
  VALUES (?, ?, ?, ?, ?, ?, 'camera', 'Verified')
`);

newVehicles.forEach(v => {
  const existing = db.prepare('SELECT id FROM detections WHERE plate_number = ? AND camera_id = ?').get(v.plate, v.cam);
  if (!existing) {
    insertStmt.run(v.time, v.cam, v.plate, v.conf, 0.98, v.cond);
    console.log('Inserted:', v.plate, 'at', v.cam);
  } else {
    console.log('Already exists:', v.plate);
  }
});

// Verify cameras
const cams = db.prepare('SELECT id, name, location FROM cameras').all();
console.log('Current cameras in DB:', cams);

// Verify recent detections
const recents = db.prepare('SELECT id, timestamp, camera_id, plate_number, ocr_confidence FROM detections ORDER BY id DESC LIMIT 10').all();
console.log('Recent 10 detections in DB:', recents);
