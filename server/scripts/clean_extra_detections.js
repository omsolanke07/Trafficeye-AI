import { db } from '../db/index.js';

const deleted = db.prepare('DELETE FROM detections WHERE id > 418').run();
console.log(`Deleted ${deleted.changes} extra live test detections.`);

db.prepare(`DELETE FROM alerts WHERE location LIKE '%Upload%' OR timestamp LIKE '%00:06:%' OR timestamp LIKE '%12:44:%'`).run();

const rows = db.prepare('SELECT * FROM detections').all();
let high = 0, review = 0, low = 0;
rows.forEach(d => {
  const oconf = d.ocr_confidence * 100;
  const cleanPlate = String(d.plate_number || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const is10 = cleanPlate.length === 10 && /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(cleanPlate);
  if (cleanPlate.length < 10) {
    low++;
  } else if (is10 && oconf >= 90 && d.status !== 'Review') {
    high++;
  } else if (d.status === 'Review' || (oconf >= 65 && oconf < 90)) {
    review++;
  } else {
    low++;
  }
});
const avg = db.prepare('SELECT AVG(ocr_confidence) as a FROM detections').get().a;
console.log({ total: rows.length, high, review, low, avgOcr: (avg * 100).toFixed(2) + '%' });
console.log('Active alerts:', db.prepare('SELECT id, plate_number FROM alerts').all());
