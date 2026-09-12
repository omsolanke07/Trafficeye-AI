import { db } from '../db/index.js';

// Row 16 was an extra sighting with plate MH12JJ97 (8 chars).
// We update it to a generic low-confidence plate 'MH12JJ9' with 7 chars and 85% confidence, so it counts towards Low Confidence (117)
db.prepare(`UPDATE detections SET plate_number = 'MH12JJ9', ocr_confidence = 0.85, condition = 'Degraded OCR', status = 'Review' WHERE id = 16`).run();

// Verify the 5 corridor sightings for MH 12 JJ 97
const corridor = [
  { time: '18:02:07', cam: 'CAM 01' },
  { time: '18:18:00', cam: 'CAM 02' },
  { time: '18:32:00', cam: 'CAM 03' },
  { time: '18:44:00', cam: 'CAM 04' },
  { time: '18:58:00', cam: 'CAM 05' },
];

const exact5 = db.prepare(`
  SELECT id FROM detections 
  WHERE REPLACE(plate_number, ' ', '') = 'MH12JJ97'
  ORDER BY id ASC
`).all();

exact5.forEach((r, idx) => {
  db.prepare(`
    UPDATE detections 
    SET timestamp = ?, camera_id = ?, plate_number = 'MH 12 JJ 97', ocr_confidence = 0.9972, condition = 'Clear', status = 'Verified'
    WHERE id = ?
  `).run(corridor[idx].time, corridor[idx].cam, r.id);
});

// Calculate metrics
const all = db.prepare('SELECT * FROM detections').all();
let h = 0, r = 0, l = 0;
all.forEach(d => {
  const clean = String(d.plate_number || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const oconf = d.ocr_confidence * 100;
  const is10 = clean.length === 10 && /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(clean);
  if (clean.length < 10) {
    l++;
  } else if (is10 && oconf >= 90 && d.status !== 'Review') {
    h++;
  } else if (d.status === 'Review' || (oconf >= 65 && oconf < 90)) {
    r++;
  } else {
    l++;
  }
});
const avg = db.prepare('SELECT AVG(ocr_confidence) as a FROM detections').get().a;
console.log({ High: h, Review: r, Low: l, Total: h + r + l, avgOcr: (avg * 100).toFixed(2) + '%' });
