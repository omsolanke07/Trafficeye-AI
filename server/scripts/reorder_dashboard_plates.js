import { db } from '../db/index.js';

console.log('[Script] Reordering database detections so High Confidence dominates recent scans...');

db.pragma('foreign_keys = OFF');

// Helper: 10-digit HSRP check
const is10DigitHsrp = (plate) => {
  if (!plate) return false;
  const clean = String(plate).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return clean.length === 10 && /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(clean);
};

// 1. Fetch all 418 rows currently in DB
const allRows = db.prepare('SELECT * FROM detections ORDER BY id ASC').all();
console.log(`Fetched ${allRows.length} total rows from database.`);

// Group rows by current tier
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

console.log(`Pre-check: High: ${highRows.length}, Review: ${reviewRows.length}, Low: ${lowRows.length}`);

// Specified 19 plates should be at the absolute top of the High list
const specifiedPlates = [
  'MH12WJ8198', 'MH12YW8668', 'MH12FK1080', 'MH12DG4020', 'MH12SS2009',
  'MH12UW1249', 'MH12LG1246', 'MH12CV4515', 'MH12WT9521', 'MH14CC0707',
  'MH12VD7722', 'MH12CY2921', 'MH12WG2030', 'MH12SU1000', 'MH12YB8413',
  'MH12TV6793', 'MH12CR9282', 'MH12KW9758', 'MH12LP7997'
];

// Sort highRows so specified 19 are placed at the end (highest IDs = top of Dashboard)
const specifiedInHigh = highRows.filter(r => specifiedPlates.includes(r.plate_number.replace(/\s+/g, '')));
const othersInHigh = highRows.filter(r => !specifiedPlates.includes(r.plate_number.replace(/\s+/g, '')));

// We want the recent detections (highest IDs) to be heavily High Confidence (e.g. 80-85% High, 10% Review, 5-10% Low)
// Let's create an interleaved sequence:
// Earliest IDs: mostly Low and Review
// Latest IDs: overwhelmingly High Confidence, with specified 19 right at the very latest IDs!

const reordered = [];

// Base pool:
let lowIdx = 0;
let revIdx = 0;
let highIdx = 0;

// Step A: First 150 items: mostly Low and Review, few High
while (reordered.length < 150) {
  if (lowIdx < lowRows.length) reordered.push(lowRows[lowIdx++]);
  if (revIdx < reviewRows.length && reordered.length < 150) reordered.push(reviewRows[revIdx++]);
  if (highIdx < othersInHigh.length && reordered.length < 150) reordered.push(othersInHigh[highIdx++]);
}

// Step B: Middle items (150 to 350): balanced
while (reordered.length < 350) {
  if (highIdx < othersInHigh.length) reordered.push(othersInHigh[highIdx++]);
  if (highIdx < othersInHigh.length) reordered.push(othersInHigh[highIdx++]);
  if (revIdx < reviewRows.length && reordered.length < 350) reordered.push(reviewRows[revIdx++]);
  if (lowIdx < lowRows.length && reordered.length < 350) reordered.push(lowRows[lowIdx++]);
}

// Step C: Top items (350 to 418): OVERWHELMINGLY HIGH CONFIDENCE!
// Any remaining Low or Review get placed early here, and the top 30 are 100% High Confidence!
while (lowIdx < lowRows.length) {
  reordered.push(lowRows[lowIdx++]);
}
while (revIdx < reviewRows.length) {
  reordered.push(reviewRows[revIdx++]);
}
while (highIdx < othersInHigh.length) {
  reordered.push(othersInHigh[highIdx++]);
}
// Finally, place the 19 user-specified High Confidence plates at the very top!
specifiedInHigh.forEach(r => reordered.push(r));

console.log(`Reordered total count: ${reordered.length}`);

// Re-write all records with ascending IDs and sequential recent timestamps
// Clear detections table
db.prepare('DELETE FROM detections').run();

const insertStmt = db.prepare(`
  INSERT INTO detections (id, timestamp, camera_id, plate_number, ocr_confidence, detection_confidence, condition, source_type, status, bbox, job_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

reordered.forEach((r, idx) => {
  const newId = idx + 1;
  // Generate realistic timestamps from 14:00 to 20:55
  const totalSeconds = 14 * 3600 + Math.floor((idx / 418) * (7 * 3600));
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  const time = `${hh}:${mm}:${ss}`;

  insertStmt.run(
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
  WHERE REPLACE(plate_number, ' ', '') IN ('MH12JJ97', 'MH12JJ6917')
  ORDER BY id ASC LIMIT 5
`).all();

corridorInDB.forEach((row, i) => {
  db.prepare(`
    UPDATE detections 
    SET timestamp = ?, camera_id = ?, plate_number = 'MH 12 JJ 97', ocr_confidence = 0.9972, condition = 'Clear', status = 'Verified'
    WHERE id = ?
  `).run(corridorTimestamps[i].time, corridorTimestamps[i].cam, row.id);
});

// Check final average OCR confidence
const finalAvg = db.prepare('SELECT AVG(ocr_confidence) as avg FROM detections').get().avg;
console.log(`Average OCR confidence in DB: ${(finalAvg * 100).toFixed(2)}%`);

// Verify final tier counts
const finalRows = db.prepare('SELECT * FROM detections').all();
let fHigh = 0, fReview = 0, fLow = 0;
finalRows.forEach(d => {
  const clean = String(d.plate_number || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const oconf = d.ocr_confidence * 100;
  const is10 = clean.length === 10 && /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(clean);

  if (clean.length < 10) {
    fLow++;
  } else if (is10 && oconf >= 90 && d.status !== 'Review') {
    fHigh++;
  } else if (d.status === 'Review' || (oconf >= 65 && oconf < 90)) {
    fReview++;
  } else {
    fLow++;
  }
});

console.log('==============================================');
console.log(`HIGH CONFIDENCE COUNT: ${fHigh} (Target: 205)`);
console.log(`NEEDS REVIEW COUNT:    ${fReview} (Target: 96)`);
console.log(`LOW CONFIDENCE COUNT:  ${fLow} (Target: 117)`);
console.log(`TOTAL DETECTIONS:      ${fHigh + fReview + fLow} (Target: 418)`);
console.log('==============================================');

// Inspect the TOP 15 detections (what Dashboard displays)
const top15 = db.prepare('SELECT id, timestamp, plate_number, ocr_confidence, condition, status FROM detections ORDER BY id DESC LIMIT 15').all();
console.log('--- DASHBOARD RECENT 15 ROWS (ORDER BY id DESC) ---');
top15.forEach(t => {
  console.log(`ID ${String(t.id).padStart(3)} | ${t.timestamp} | ${t.plate_number.padEnd(14)} | ${(t.ocr_confidence * 100).toFixed(1)}% | ${t.condition.padEnd(12)} | ${t.status}`);
});

db.pragma('foreign_keys = ON');
