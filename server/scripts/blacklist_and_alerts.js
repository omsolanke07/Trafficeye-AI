import { db } from '../db/index.js';

const targetPlates = ['MH12SU1000', 'MH12WG2030', 'MH12CY2921', 'MH12VD7722'];

const rows = db.prepare(`
  SELECT id, timestamp, camera_id, plate_number, ocr_confidence, condition, status 
  FROM detections 
  WHERE REPLACE(plate_number, ' ', '') IN ('MH12SU1000', 'MH12WG2030', 'MH12CY2921', 'MH12VD7722')
`).all();

console.log('Found rows:', rows);
