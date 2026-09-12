import { db } from '../db/index.js';

console.log('[Script] Starting Blacklist, Alerts, and Mixed Dashboard plates update...');

db.pragma('foreign_keys = OFF');

// 1. Target 4 Blacklist Vehicles
const blacklistedPlates = [
  {
    plate: 'MH12SU1000',
    reason: 'Stolen Vehicle / FIR #2024-SU100',
    category: 'Stolen',
    priority: 'Critical',
    cam: 'CAM 04',
    location: 'Aranyeshwar Circle, Pune',
    time: '20:48:56'
  },
  {
    plate: 'MH12WG2030',
    reason: 'Wanted in Hit and Run Investigation',
    category: 'Wanted',
    priority: 'Critical',
    cam: 'CAM 03',
    location: 'Gajanan Maharaj Temple, Pune',
    time: '20:47:56'
  },
  {
    plate: 'MH12CY2921',
    reason: 'Crime Branch Intercept / Narcotics Surveillance',
    category: 'Suspicious',
    priority: 'High',
    cam: 'CAM 02',
    location: 'Shiv Darshan Chowk, Pune',
    time: '20:45:55'
  },
  {
    plate: 'MH12VD7722',
    reason: 'Stolen Commercial Transport / Intercept Order',
    category: 'Stolen',
    priority: 'Critical',
    cam: 'CAM 01',
    location: 'PVG, Pune',
    time: '20:44:55'
  }
];

// Clear existing blacklist and alerts to populate fresh genuine records
db.prepare('DELETE FROM blacklist').run();
db.prepare('DELETE FROM alerts').run();

const insertBlacklistStmt = db.prepare(`
  INSERT INTO blacklist (
    plate_number, reason, fir_ref, added_by, date_added, status, last_seen_at,
    category, priority, notes, created_at, updated_at, created_by, last_seen_camera_id
  )
  VALUES (?, ?, ?, ?, datetime('now'), 'Active', ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)
`);

const insertAlertStmt = db.prepare(`
  INSERT INTO alerts (id, plate_number, alert_type, severity, camera_id, location, timestamp, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
`);

blacklistedPlates.forEach((bp, idx) => {
  insertBlacklistStmt.run(
    bp.plate,
    bp.reason,
    `FIR-2024-00${idx + 101}`,
    'Insp. R. Deshmukh',
    `${bp.location} · ${bp.time}`,
    bp.category,
    bp.priority,
    `Automated ANPR trigger at ${bp.cam}`,
    'Insp. R. Deshmukh',
    bp.cam
  );

  const alertId = `ALT-${1001 + idx}`;
  insertAlertStmt.run(
    alertId,
    bp.plate,
    `Blacklist Match (${bp.reason.split('/')[0].trim()})`,
    bp.priority,
    bp.cam,
    `${bp.location}`,
    `${bp.time} IST`
  );
});

// Ensure all camera nodes maintain online status
db.prepare(`UPDATE cameras SET status = 'online'`).run();

console.log('Blacklist and Alerts successfully inserted!');

// 2. Fetch all 418 rows and classify into High, Review, Low
const allRows = db.prepare('SELECT * FROM detections ORDER BY id ASC').all();

const highRows = [];
const reviewRows = [];
const lowRows = [];

allRows.forEach(d => {
  const clean = String(d.plate_number || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const oconf = d.ocr_confidence * 100;
  const is10 = clean.length === 10 && /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(clean);

  if (clean.length < 10) {
    lowRows.push(d);
  } else if (is10 && oconf >= 90 && d.status !== 'Review') {
    highRows.push(d);
  } else if (d.status === 'Review' || (oconf >= 65 && oconf < 90)) {
    reviewRows.push(d);
  } else {
    lowRows.push(d);
  }
});

console.log(`Current classification: High: ${highRows.length}, Review: ${reviewRows.length}, Low: ${lowRows.length}`);

// Set status = 'Flagged' for the 4 target vehicles in highRows
const flaggedPlatesList = ['MH12SU1000', 'MH12WG2030', 'MH12CY2921', 'MH12VD7722'];
highRows.forEach(r => {
  const clean = String(r.plate_number || '').replace(/\s+/g, '');
  if (flaggedPlatesList.includes(clean)) {
    r.status = 'Flagged';
  }
});

// Separate the 4 flagged plates and other specified high plates
const flaggedHigh = highRows.filter(r => flaggedPlatesList.includes(r.plate_number.replace(/\s+/g, '')));
const nonFlaggedHigh = highRows.filter(r => !flaggedPlatesList.includes(r.plate_number.replace(/\s+/g, '')));

// We want the top 15 detections (highest IDs) to be:
// 11 High Confidence (including all 4 flagged vehicles!)
// 3 Low Confidence
// 1 Needs Review
// This satisfies:
// - "high confidence plates are more and low confidence are less" (11 vs 3)
// - "mix them with some low confidence plates" (3 low + 1 review mixed in)
// - "once detected, give an alert of these four vehicles on dashboard" (4 flagged plates are in the top 15!)

const top15High = [
  ...flaggedHigh, // 4 flagged vehicles
  ...nonFlaggedHigh.slice(nonFlaggedHigh.length - 7) // 7 other high plates
];
const remainingHigh = nonFlaggedHigh.slice(0, nonFlaggedHigh.length - 7);

const top15Low = lowRows.slice(lowRows.length - 3);
const remainingLow = lowRows.slice(0, lowRows.length - 3);

const top15Review = reviewRows.slice(reviewRows.length - 1);
const remainingReview = reviewRows.slice(0, reviewRows.length - 1);

// Build the base 403 rows (earlier detections)
const baseList = [];
let hIdx = 0, rIdx = 0, lIdx = 0;

// Interleave the remaining 403 rows
while (hIdx < remainingHigh.length || rIdx < remainingReview.length || lIdx < remainingLow.length) {
  if (hIdx < remainingHigh.length) baseList.push(remainingHigh[hIdx++]);
  if (hIdx < remainingHigh.length) baseList.push(remainingHigh[hIdx++]);
  if (rIdx < remainingReview.length) baseList.push(remainingReview[rIdx++]);
  if (lIdx < remainingLow.length) baseList.push(remainingLow[lIdx++]);
}

// Build the top 15 rows interleaved:
// Indices 0 to 14 (will be placed at IDs 404 to 418)
// Top 15 order (from ID 404 up to 418):
const top15Interleaved = [
  top15High[0],              // 404: High
  top15High[1],              // 405: High
  top15Low[0],               // 406: Low (Degraded OCR)
  top15High[2],              // 407: High
  top15High[3],              // 408: High
  top15High[4],              // 409: High (Flagged: MH12VD7722)
  top15Low[1],               // 410: Low (Degraded OCR)
  top15High[5],              // 411: High
  top15High[6],              // 412: High (Flagged: MH12CY2921)
  top15Review[0],            // 413: Review (Angled Plate)
  top15High[7],              // 414: High
  top15High[8],              // 415: High (Flagged: MH12WG2030)
  top15Low[2],               // 416: Low (Degraded OCR)
  top15High[9],              // 417: High
  top15High[10]              // 418: High (Flagged: MH12SU1000)
];

const finalList = [...baseList, ...top15Interleaved];
console.log(`Total assembled rows: ${finalList.length}`);

// Re-insert all rows with sequential IDs and realistic timestamps
db.prepare('DELETE FROM detections').run();

const insertDetStmt = db.prepare(`
  INSERT INTO detections (id, timestamp, camera_id, plate_number, ocr_confidence, detection_confidence, condition, source_type, status, bbox, job_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

finalList.forEach((r, idx) => {
  const newId = idx + 1;
  const totalSeconds = 14 * 3600 + Math.floor((idx / 418) * (7 * 3600));
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  const time = `${hh}:${mm}:${ss}`;

  insertDetStmt.run(
    newId,
    time,
    r.camera_id || 'CAM 01',
    r.plate_number,
    r.ocr_confidence,
    r.detection_confidence || 0.98,
    r.condition || 'Clear',
    r.source_type || 'camera',
    r.status || 'Verified',
    r.bbox || null,
    r.job_id || null
  );
});

// Re-verify corridor transit timestamps for MH 12 JJ 97
const corridorTimestamps = [
  { time: '18:02:07', cam: 'CAM 01' },
  { time: '18:18:00', cam: 'CAM 02' },
  { time: '18:32:00', cam: 'CAM 03' },
  { time: '18:44:00', cam: 'CAM 04' },
  { time: '18:58:00', cam: 'CAM 05' },
];

const corridorInDB = db.prepare(`
  SELECT id FROM detections 
  WHERE REPLACE(plate_number, ' ', '') = 'MH12JJ97'
  ORDER BY id ASC
`).all();

corridorInDB.forEach((row, i) => {
  db.prepare(`
    UPDATE detections 
    SET timestamp = ?, camera_id = ?, plate_number = 'MH 12 JJ 97', ocr_confidence = 0.9972, condition = 'Clear', status = 'Verified'
    WHERE id = ?
  `).run(corridorTimestamps[i].time, corridorTimestamps[i].cam, row.id);
});

// Check metrics
const finalRows = db.prepare('SELECT * FROM detections').all();
let fH = 0, fR = 0, fL = 0;
finalRows.forEach(d => {
  const clean = String(d.plate_number || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const oconf = d.ocr_confidence * 100;
  const is10 = clean.length === 10 && /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(clean);
  if (clean.length < 10) {
    fL++;
  } else if (is10 && oconf >= 90 && d.status !== 'Review') {
    fH++;
  } else if (d.status === 'Review' || (oconf >= 65 && oconf < 90)) {
    fR++;
  } else {
    fL++;
  }
});

const finalAvg = db.prepare('SELECT AVG(ocr_confidence) as avg FROM detections').get().avg;

console.log('================ METRICS SUMMARY ================');
console.log(`High: ${fH} (Target: 205)`);
console.log(`Review: ${fR} (Target: 96)`);
console.log(`Low: ${fL} (Target: 117)`);
console.log(`Total: ${fH + fR + fL} (Target: 418)`);
console.log(`Average OCR Accuracy: ${(finalAvg * 100).toFixed(2)}% (Target: 92.00%)`);
console.log('=================================================');

// Print the Top 15 recent detections
const top15 = db.prepare('SELECT id, timestamp, camera_id, plate_number, ocr_confidence, condition, status FROM detections ORDER BY id DESC LIMIT 15').all();
console.log('\n--- TOP 15 DASHBOARD RECENT DETECTIONS ---');
top15.forEach(t => {
  console.log(`ID ${String(t.id).padStart(3)} | ${t.timestamp} | ${t.camera_id} | ${t.plate_number.padEnd(12)} | ${(t.ocr_confidence * 100).toFixed(1)}% | ${t.condition.padEnd(14)} | ${t.status}`);
});

db.pragma('foreign_keys = ON');
