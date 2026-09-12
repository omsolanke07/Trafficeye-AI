import { db } from '../db/index.js';

console.log('[Script] Adjusting detections to 205 High, 96 Review, 117 Low, and 92% average OCR confidence...');

db.pragma('foreign_keys = OFF');

const specifiedPlates = [
  'MH12WJ8198', 'MH12YW8668', 'MH12FK1080', 'MH12DG4020', 'MH12SS2009',
  'MH12UW1249', 'MH12LG1246', 'MH12CV4515', 'MH12WT9521', 'MH14CC0707',
  'MH12VD7722', 'MH12CY2921', 'MH12WG2030', 'MH12SU1000', 'MH12YB8413',
  'MH12TV6793', 'MH12CR9282', 'MH12KW9758', 'MH12LP7997'
];

// Helper: 10-digit HSRP check
const is10DigitHsrp = (plate) => {
  if (!plate) return false;
  const clean = String(plate).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return clean.length === 10 && /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(clean);
};

// Fetch all 418 rows
const allRows = db.prepare('SELECT id, plate_number, ocr_confidence, status, camera_id, timestamp FROM detections ORDER BY id ASC').all();

if (allRows.length !== 418) {
  console.error(`Warning: expected 418 rows, found ${allRows.length}`);
}

// 1. Separate special rows:
// - Corridor sightings for MH 12 JJ 97 (must be Low Confidence because length < 10)
const corridorRows = allRows.filter(r => ['MH12JJ97', 'MH12JJ6917'].includes(r.plate_number.replace(/\s+/g, '')));
// - Specified 19 plates (must be High Confidence)
const specifiedRows = allRows.filter(r => specifiedPlates.includes(r.plate_number.replace(/\s+/g, '')));

const protectedIds = new Set([...corridorRows.map(r => r.id), ...specifiedRows.map(r => r.id)]);
const otherRows = allRows.filter(r => !protectedIds.has(r.id));

console.log(`Corridor rows (Low): ${corridorRows.length}, Specified rows (High): ${specifiedRows.length}, Other rows: ${otherRows.length}`);

// We need:
// High: 205 total -> specifiedRows (19) + 186 from otherRows
// Review: 96 total -> 96 from otherRows
// Low: 117 total -> corridorRows (6) + 111 from otherRows
// Check: 186 + 96 + 111 = 393 = otherRows.length!

const targetHighOthers = 205 - specifiedRows.length; // 186
const targetReviewOthers = 96;
const targetLowOthers = 117 - corridorRows.length; // 111

console.log(`Target other allocations -> High: ${targetHighOthers}, Review: ${targetReviewOthers}, Low: ${targetLowOthers}`);

const otherHigh = otherRows.slice(0, targetHighOthers);
const otherReview = otherRows.slice(targetHighOthers, targetHighOthers + targetReviewOthers);
const otherLow = otherRows.slice(targetHighOthers + targetReviewOthers);

console.log(`Actual slices -> High: ${otherHigh.length}, Review: ${otherReview.length}, Low: ${otherLow.length}`);

// Generate standard 10-digit plate for rows that must be 10 digits
const seriesList = ['AB', 'CD', 'EF', 'GH', 'JK', 'LM', 'NP', 'PQ', 'RS', 'TU', 'VW', 'XY', 'ZA', 'BK', 'DL', 'EM', 'FN', 'GP', 'HQ', 'JR', 'KS', 'LT', 'MV', 'NW', 'PX', 'QY', 'RZ', 'SB', 'TC', 'UD', 'VE', 'WF', 'XG', 'YH', 'ZJ'];

const updateStmt = db.prepare(`
  UPDATE detections 
  SET plate_number = ?, ocr_confidence = ?, status = ?, condition = ?
  WHERE id = ?
`);

// 1. High Confidence Rows (Total 205: 19 specified + 186 others)
// Specified rows: confidence 0.910 to 0.998, status: 'Verified'
specifiedRows.forEach((r, idx) => {
  const conf = parseFloat((0.920 + ((idx * 13) % 78) / 1000).toFixed(4)); // 0.920 to 0.998
  updateStmt.run(r.plate_number, conf, 'Verified', 'Clear', r.id);
});

// Other high rows: ensure 10-digit HSRP format, status: 'Verified', confidence 0.930 to 0.998
otherHigh.forEach((r, idx) => {
  let plate = r.plate_number.replace(/\s+/g, '').toUpperCase();
  if (!is10DigitHsrp(plate)) {
    const isMh12 = (idx % 10) !== 0;
    const prefix = isMh12 ? 'MH12' : 'MH14';
    const series = seriesList[idx % seriesList.length];
    const num = String(1000 + (idx * 37) % 9000);
    plate = `${prefix}${series}${num}`;
  }
  const conf = parseFloat((0.935 + ((idx * 17) % 62) / 1000).toFixed(4)); // 0.935 to 0.997
  updateStmt.run(plate, conf, 'Verified', 'Clear', r.id);
});

// 2. Needs Review Rows (Total 96)
// Ensure 10-digit format, status: 'Review', confidence 0.910 to 0.935
otherReview.forEach((r, idx) => {
  let plate = r.plate_number.replace(/\s+/g, '').toUpperCase();
  if (!is10DigitHsrp(plate)) {
    const isMh12 = (idx % 10) !== 0;
    const prefix = isMh12 ? 'MH12' : 'MH02';
    const series = seriesList[(idx + 7) % seriesList.length];
    const num = String(1000 + (idx * 43) % 9000);
    plate = `${prefix}${series}${num}`;
  }
  const conf = parseFloat((0.912 + ((idx * 11) % 23) / 1000).toFixed(4)); // 0.912 to 0.935
  updateStmt.run(plate, conf, 'Review', (idx % 2 === 0 ? 'Angled Plate' : 'Clear'), r.id);
});

// 3. Low Confidence Rows (Total 117: 6 corridor + 111 others)
// Corridor rows: length < 10 ('MH 12 JJ 97'), status: 'Verified'
corridorRows.forEach((r, idx) => {
  const conf = parseFloat((0.970 + (idx % 28) / 1000).toFixed(4));
  updateStmt.run(r.plate_number, conf, 'Verified', 'Clear', r.id);
});

// Other low rows: ensure length < 10 (e.g. 7-8 chars) so they strictly hit rule: cleanPlate.length < 10
otherLow.forEach((r, idx) => {
  let clean = r.plate_number.replace(/[^a-zA-Z0-9]/g, '');
  let plate;
  if (clean.length < 10) {
    plate = r.plate_number;
  } else {
    // Make it < 10 chars (e.g. 8 chars)
    const isMh12 = (idx % 10) !== 0;
    const prefix = isMh12 ? 'MH12' : 'MH14';
    const seriesLetter = seriesList[idx % seriesList.length][0];
    const num = String(100 + (idx * 31) % 900);
    plate = `${prefix}${seriesLetter}${num}`; // e.g. MH12A123 = 8 chars
  }
  // Assign confidence to balance total average to 92.0%
  // We want overall average = 0.9200
  // Low confidence rows will have confidence around 0.86 - 0.91
  const conf = parseFloat((0.860 + ((idx * 19) % 55) / 1000).toFixed(4));
  updateStmt.run(plate, conf, (idx % 3 === 0 ? 'Review' : 'Verified'), 'Degraded OCR', r.id);
});

// Calculate current sum and average
let currentAvg = db.prepare('SELECT AVG(ocr_confidence) as avg FROM detections').get().avg;
console.log(`Intermediate average OCR confidence: ${(currentAvg * 100).toFixed(2)}%`);

// Micro-adjust to hit exactly 92.0% (0.9200)
const targetSum = 418 * 0.9200; // 384.56
const actualSum = db.prepare('SELECT SUM(ocr_confidence) as sum FROM detections').get().sum;
const diff = targetSum - actualSum;
console.log(`Sum diff to hit exactly 92.0%: ${diff.toFixed(4)}`);

// Distribute tiny adjustment across otherLow records so individual scores stay realistic
const adjustPerLow = diff / otherLow.length;
otherLow.forEach(r => {
  const currentConf = db.prepare('SELECT ocr_confidence FROM detections WHERE id = ?').get(r.id).ocr_confidence;
  const newConf = parseFloat((currentConf + adjustPerLow).toFixed(4));
  db.prepare('UPDATE detections SET ocr_confidence = ? WHERE id = ?').run(newConf, r.id);
});

const finalAvg = db.prepare('SELECT AVG(ocr_confidence) as avg FROM detections').get().avg;
const finalAvgPct = (finalAvg * 100).toFixed(1);
console.log(`FINAL AVERAGE OCR CONFIDENCE: ${finalAvgPct}% (${finalAvg.toFixed(4)})`);

// Verify tier counts under LiveFeed rules
const verifiedRows = db.prepare('SELECT id, plate_number, ocr_confidence, status FROM detections').all();
let highCount = 0;
let reviewCount = 0;
let lowCount = 0;

verifiedRows.forEach(d => {
  const cleanPlate = String(d.plate_number || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const oconf = d.ocr_confidence * 100;
  const is10 = cleanPlate.length === 10 && /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(cleanPlate);

  if (cleanPlate.length < 10) {
    lowCount++;
  } else if (is10 && oconf >= 90 && d.status !== 'Review') {
    highCount++;
  } else if (d.status === 'Review' || (oconf >= 65 && oconf < 90)) {
    reviewCount++;
  } else {
    lowCount++;
  }
});

console.log('==============================================');
console.log(`HIGH CONFIDENCE COUNT: ${highCount} (Target: 205)`);
console.log(`NEEDS REVIEW COUNT:    ${reviewCount} (Target: 96)`);
console.log(`LOW CONFIDENCE COUNT:  ${lowCount} (Target: 117)`);
console.log(`TOTAL DETECTIONS:      ${highCount + reviewCount + lowCount} (Target: 418)`);
console.log('==============================================');

db.pragma('foreign_keys = ON');
