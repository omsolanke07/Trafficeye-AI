import { db } from '../db/index.js';

console.log('[Script] Starting camera update and 418 plate population...');

db.pragma('foreign_keys = OFF');

// 1. Configure the 5 surveillance cameras with CAM 01 = PVG and CAM 02 = Shiv Darshan Chowk
const camerasConfig = [
  {
    id: 'CAM 01',
    name: 'PVG',
    location: 'PVG College Gate',
    ward: 'Parvati / Swargate',
    sector: 'Sector 4',
    lat: 18.490428,
    lng: 73.854266,
    url: '/videos/pvg_college.mp4'
  },
  {
    id: 'CAM 02',
    name: 'Shiv Darshan Chowk',
    location: 'Shiv Darshan Chowk',
    ward: 'Shiv Darshan Chowk',
    sector: 'Shiv Darshan Chowk',
    lat: 18.49249,
    lng: 73.8541,
    url: '/videos/shiv_darshan_chowk.mp4'
  },
  {
    id: 'CAM 03',
    name: 'Gajanan Maharaj Temple',
    location: 'Gajanan Maharaj Temple',
    ward: 'Gajanan Maharaj Temple',
    sector: 'Gajanan Maharaj Temple',
    lat: 18.492649,
    lng: 73.849843,
    url: '/videos/gajanan_maharaj_temple.mp4'
  },
  {
    id: 'CAM 04',
    name: 'Aranyeshwar Circle',
    location: 'Aranyeshwar Circle',
    ward: 'Aranyeshwar Circle',
    sector: 'Aranyeshwar Circle',
    lat: 18.485117,
    lng: 73.849881,
    url: '/videos/aranyeshwar_circle.mp4'
  },
  {
    id: 'CAM 05',
    name: 'Taware Colony',
    location: 'Taware Colony',
    ward: 'Taware Colony',
    sector: 'Taware Colony',
    lat: 18.486004,
    lng: 73.854011,
    url: '/videos/taware_colony.mp4'
  }
];

// Clean out existing cameras and re-insert exactly the 5 official cameras
db.prepare('DELETE FROM cameras').run();
const insertCam = db.prepare(`
  INSERT INTO cameras (id, name, location, ward, sector, lat, lng, ip_address, fps, resolution, status, last_seen, source_type, source_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, '127.0.0.1', 30, '1080p', 'online', '20:15:00', 'video_file', ?)
`);
camerasConfig.forEach(c => {
  insertCam.run(c.id, c.name, c.location, c.ward, c.sector, c.lat, c.lng, c.url);
  console.log(`Configured Camera: ${c.id} -> ${c.name} (${c.location})`);
});

// 2. Ensure MH 12 JJ 97 transit corridor matches CAM 01 -> CAM 02 -> CAM 03 -> CAM 04 -> CAM 05
const corridorLegs = [
  { time: '18:02:07', cam: 'CAM 01' },
  { time: '18:18:00', cam: 'CAM 02' },
  { time: '18:32:00', cam: 'CAM 03' },
  { time: '18:44:00', cam: 'CAM 04' },
  { time: '18:58:00', cam: 'CAM 05' },
];

corridorLegs.forEach((leg, i) => {
  db.prepare(`
    UPDATE detections 
    SET camera_id = ?
    WHERE REPLACE(plate_number, ' ', '') IN ('MH12JJ97', 'MH12JJ6917')
      AND timestamp = ?
  `).run(leg.cam, leg.time);
});

// 3. Shuffle camera numbers for existing detections
const camList = ['CAM 01', 'CAM 02', 'CAM 03', 'CAM 04', 'CAM 05'];
const existingRows = db.prepare(`
  SELECT id, plate_number, timestamp FROM detections 
  WHERE REPLACE(plate_number, ' ', '') NOT IN ('MH12JJ97', 'MH12JJ6917')
`).all();

existingRows.forEach((row, idx) => {
  const chosenCam = camList[idx % camList.length];
  db.prepare('UPDATE detections SET camera_id = ? WHERE id = ?').run(chosenCam, row.id);
});
console.log(`Shuffled camera IDs across ${existingRows.length} existing detections.`);

// 4. Add the 19 user-specified High Confidence plates (varying confidence 90% to 100%)
const specifiedHighPlates = [
  'MH12WJ8198',
  'MH12YW8668',
  'MH12FK1080',
  'MH12DG4020',
  'MH12SS2009',
  'MH12UW1249',
  'MH12LG1246',
  'MH12CV4515',
  'MH12WT9521',
  'MH14CC0707',
  'MH12VD7722',
  'MH12CY2921',
  'MH12WG2030',
  'MH12SU1000',
  'MH12YB8413',
  'MH12TV6793',
  'MH12CR9282',
  'MH12KW9758',
  'MH12LP7997'
];

// Delete any previous duplicate of these 19 to re-insert cleanly with varying confidence and cameras
specifiedHighPlates.forEach(p => {
  db.prepare("DELETE FROM detections WHERE REPLACE(plate_number, ' ', '') = ?").run(p);
});

const insertDet = db.prepare(`
  INSERT INTO detections (timestamp, camera_id, plate_number, ocr_confidence, detection_confidence, condition, source_type, status)
  VALUES (?, ?, ?, ?, ?, ?, 'camera', ?)
`);

// Varying confidence between 91.2% and 99.8%
specifiedHighPlates.forEach((plate, i) => {
  const cam = camList[i % camList.length];
  const conf = parseFloat((0.91 + ((i * 17) % 89) / 1000).toFixed(4)); // 0.91 to 0.999
  const m = String(10 + (i * 2) % 50).padStart(2, '0');
  const s = String(15 + (i * 3) % 45).padStart(2, '0');
  const time = `19:${m}:${s}`;
  insertDet.run(time, cam, plate, conf, 0.98, 'Clear', 'Verified');
  console.log(`Inserted High Conf Plate: ${plate} at ${cam} with ${Math.round(conf * 100)}% conf`);
});

// 5. Calculate remaining plates to reach exactly 418 total detections
const currentCount = db.prepare('SELECT count(*) as count FROM detections').get().count;
const remainingCount = 418 - currentCount;
console.log(`Current detections count: ${currentCount}. Needed to reach 418: ${remainingCount}`);

// Generate remaining plates: 90% MH12, varying cameras, all OCR conf > 90%
// Randomly assign to the three tiers:
// - ~40% High Confidence (10-digit HSRP, status: 'Verified')
// - ~35% Needs Review (10-digit HSRP, status: 'Review')
// - ~25% Low Confidence (digits < 10, status: 'Verified' or 'Review')

const seriesList = ['AB', 'CD', 'EF', 'GH', 'JK', 'LM', 'NP', 'PQ', 'RS', 'TU', 'VW', 'XY', 'ZA', 'BK', 'DL', 'EM', 'FN', 'GP', 'HQ', 'JR', 'KS', 'LT', 'MV', 'NW', 'PX', 'QY', 'RZ', 'SB', 'TC', 'UD', 'VE', 'WF', 'XG', 'YH', 'ZJ'];

for (let i = 0; i < remainingCount; i++) {
  const isMh12 = (i % 10) !== 0; // 90% MH12, 10% MH14 or MH02
  const prefix = isMh12 ? 'MH12' : (i % 2 === 0 ? 'MH14' : 'MH02');
  const cam = camList[(i + 2) % camList.length];

  // OCR confidence above 90% (0.902 to 0.998)
  const conf = parseFloat((0.902 + ((i * 13) % 95) / 1000).toFixed(4));

  // Determine tier distribution:
  // User requested: "place all the vehicles with digits less than 10 in low confidence section"
  // "add those remaining number plates randomly to all three sections such that the ocr confidence is above 90%"
  const tierSelector = i % 3; 

  let plateStr;
  let status = 'Verified';
  let cond = 'Clear';

  if (tierSelector === 0) {
    // High Confidence: Valid 10-digit HSRP
    const series = seriesList[i % seriesList.length];
    const num = String(1000 + (i * 37) % 9000);
    plateStr = `${prefix}${series}${num}`;
    status = 'Verified';
  } else if (tierSelector === 1) {
    // Needs Review: Valid 10-digit HSRP marked for operator review / audit
    const series = seriesList[(i + 5) % seriesList.length];
    const num = String(1000 + (i * 41) % 9000);
    plateStr = `${prefix}${series}${num}`;
    status = 'Review';
    cond = (i % 2 === 0) ? 'Angled Plate' : 'Clear';
  } else {
    // Low Confidence: Digits less than 10 (e.g. 7-9 characters) with OCR > 90%
    const series = seriesList[(i + 10) % seriesList.length][0]; // 1 letter
    const num = String(100 + (i * 29) % 900); // 3 digits -> e.g. MH12A123 (8 chars < 10)
    plateStr = `${prefix}${series}${num}`;
    status = (i % 2 === 0) ? 'Verified' : 'Review';
  }

  const hour = String(10 + Math.floor(i / 30) % 12).padStart(2, '0');
  const min = String((i * 7) % 60).padStart(2, '0');
  const sec = String((i * 11) % 60).padStart(2, '0');
  const time = `${hour}:${min}:${sec}`;

  insertDet.run(time, cam, plateStr, conf, 0.95, cond, status);
}

db.pragma('foreign_keys = ON');

// 6. Verify final database state
const finalCount = db.prepare('SELECT count(*) as count FROM detections').get().count;
const mh12Count = db.prepare("SELECT count(*) as count FROM detections WHERE plate_number LIKE 'MH12%' OR plate_number LIKE 'MH 12%'").get().count;
const mh12Pct = ((mh12Count / finalCount) * 100).toFixed(1);

console.log('==============================================');
console.log(`FINAL TOTAL DETECTIONS IN DB: ${finalCount} (Target: 418)`);
console.log(`MH12 PLATES IN DB: ${mh12Count} (${mh12Pct}% of total)`);
console.log('CAMERAS IN DB:', db.prepare('SELECT id, name, location FROM cameras ORDER BY id ASC').all());
console.log('==============================================');
