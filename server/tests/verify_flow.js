/**
 * End-to-End Integration Verification Script
 * ==========================================
 * Tests the complete data flow via HTTP API & SQLite:
 * 1. AI Status check (YOLO on cuda:0, OCR on gpu:0)
 * 2. Test Case 1: Real Image Inference on test_image.jpg -> AI -> detectionService -> SQLite -> GET /api/detections
 * 3. Test Case 2: Exact confidence value preservation (HR35M2576, det=0.9027, ocr=1.0)
 * 4. Test Case 3: Blacklist matching: active blacklist record -> detection Flagged + Security Alert created
 * 5. Test Case 4: Non-blacklisted plate -> detection Verified + NO alert created
 * 6. Test Case 5: Job flow: POST /api/ai/upload -> POST /api/ai/jobs -> GET /api/ai/jobs/:id/results
 * 7. KPIs & Reports: GET /api/kpis and POST /api/reports/generate using real persisted data
 */

import { db, executeWrite } from '../db/index.js';
import { normalizePlate } from '../services/detectionService.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const TEST_IMAGE = path.join(PROJECT_ROOT, 'test_image.jpg');
const API_BASE = 'http://localhost:5000';

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failCount++;
  }
}

async function runTests() {
  console.log('\n==================================================');
  console.log(' TrafficEye AI — End-to-End Integration Test Suite');
  console.log('==================================================\n');

  // 1. Authenticate to get JWT token
  console.log('[AUTH] Logging in with administrative credentials...');
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'deshmukh', password: 'police123' })
  });
  const loginData = await loginRes.json();
  assert(loginRes.ok && loginData.data?.token, 'Admin authentication successful');
  const token = loginData.data.token;
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 2. Check AI status
  console.log('\n[STATUS] Verifying AI Pipeline status:');
  const statusRes = await fetch(`${API_BASE}/api/ai/status`, { headers: authHeaders });
  const statusData = await statusRes.json();
  assert(statusData.anpr?.ready === true, `ANPR Pipeline ready: YOLO (${statusData.anpr?.detectorDevice}) | OCR (${statusData.anpr?.ocrDevice})`);
  assert(statusData.anpr?.detector_alive === true, 'YOLO detector worker is alive');
  assert(statusData.anpr?.ocr_alive === true, 'Awiros OCR worker is alive');

  // ── TEST CASE 1: Real AI Inference on Image ─────────────────────────
  console.log('\n[TEST 1] Real Image Inference -> AI -> DB -> API:');
  const initialDetCount = db.prepare('SELECT COUNT(*) as count FROM detections').get().count;

  const inferRes = await fetch(`${API_BASE}/api/ai/infer`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ image_path: TEST_IMAGE, conf: 0.25 })
  });
  const inferData = await inferRes.json();
  assert(inferRes.ok && inferData.success === true, 'POST /api/ai/infer returned success');
  assert(inferData.plates && inferData.plates.length > 0, `AI detected ${inferData.plates?.length} plate(s)`);

  const primaryPlate = inferData.plates[0];
  const detectedPlateText = primaryPlate.plateNumber || primaryPlate.rawOCRText;
  console.log(`  -> AI Recognized Plate: "${detectedPlateText}" (Det: ${primaryPlate.detectionConfidence}, OCR: ${primaryPlate.ocrConfidence})`);

  assert(inferData.detection != null, 'Response includes database-backed primary detection object');
  const createdDetId = inferData.detection.id;
  assert(createdDetId > 0, `Detection persisted with SQLite row ID: ${createdDetId}`);

  // Query SQLite directly
  const dbRow = db.prepare('SELECT * FROM detections WHERE id = ?').get(createdDetId);
  assert(dbRow != null, 'Detection row exists in SQLite detections table');
  assert(normalizePlate(dbRow.plate_number) === normalizePlate(detectedPlateText), `SQLite plate_number matches: "${dbRow.plate_number}"`);

  // Verify GET /api/detections returns this row
  const listRes = await fetch(`${API_BASE}/api/detections?limit=10`, { headers: authHeaders });
  const listData = await listRes.json();
  assert(listRes.ok && listData.success === true, 'GET /api/detections succeeded');
  const foundInApi = listData.data.items.some(d => d.id === createdDetId);
  assert(foundInApi, `Newly inserted detection (ID ${createdDetId}) returned in GET /api/detections`);

  const afterDetCount = db.prepare('SELECT COUNT(*) as count FROM detections').get().count;
  assert(afterDetCount === initialDetCount + 1, `Total detections count incremented: ${initialDetCount} -> ${afterDetCount}`);

  // ── TEST CASE 2: Unrounded Confidence Values ────────────────────────
  console.log('\n[TEST 2] Confidence Value Precision Preservation (det=0.9027, ocr=1.0):');
  const precRes = await fetch(`${API_BASE}/api/detections`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      plate_number: 'HR35M2576',
      detection_confidence: 0.9027,
      ocr_confidence: 1.0,
      condition: 'Clear'
    })
  });
  const precData = await precRes.json();
  assert(precRes.ok && precData.success === true, 'POST /api/detections for HR35M2576 succeeded');

  const precDetId = precData.data.detection.id;
  const precRow = db.prepare('SELECT * FROM detections WHERE id = ?').get(precDetId);
  assert(precRow.detection_confidence === 0.9027, `SQLite detection_confidence preserved exactly: expected 0.9027, got ${precRow.detection_confidence}`);
  assert(precRow.ocr_confidence === 1.0, `SQLite ocr_confidence preserved exactly: expected 1.0, got ${precRow.ocr_confidence}`);

  // Verify API endpoint preserves precision
  const apiPrecCheck = await fetch(`${API_BASE}/api/detections?limit=5`, { headers: authHeaders });
  const apiPrecData = await apiPrecCheck.json();
  const apiRow = apiPrecData.data.items.find(d => d.id === precDetId);
  assert(apiRow != null, 'Detection retrieved via GET /api/detections');
  assert(apiRow.detection_confidence === 0.9027, `API detection_confidence is 0.9027: ${apiRow.detection_confidence}`);
  assert(apiRow.ocr_confidence === 1.0, `API ocr_confidence is 1.0: ${apiRow.ocr_confidence}`);

  // ── TEST CASE 3: Blacklist Matching & Alert Trigger ─────────────────
  console.log('\n[TEST 3] Blacklist Matching: Active Entry -> Status Flagged + Security Alert:');
  const blacklistedPlate = 'HR35M2576';
  const cleanPlate = normalizePlate(blacklistedPlate);

  // Add to blacklist
  await executeWrite((database) => {
    const existing = database.prepare('SELECT * FROM blacklist WHERE plate_number = ?').get(blacklistedPlate);
    if (!existing) {
      database.prepare(`
        INSERT INTO blacklist (plate_number, reason, added_by, date_added, status, priority, category)
        VALUES (?, 'Vehicle Wanted for Armed Robbery', 'ACP Crime Branch', '2026-09-10', 'Active', 'Critical', 'wanted')
      `).run(blacklistedPlate);
    } else {
      database.prepare("UPDATE blacklist SET status = 'Active' WHERE plate_number = ?").run(blacklistedPlate);
    }
  });

  const initialAlertsCount = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'Active'").get().count;

  // Ingest detection of blacklisted plate
  const blDetRes = await fetch(`${API_BASE}/api/detections`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      plate_number: blacklistedPlate,
      detection_confidence: 0.95,
      ocr_confidence: 0.99
    })
  });
  const blDetData = await blDetRes.json();
  assert(blDetRes.ok && blDetData.success === true, 'Detection ingested');
  assert(blDetData.data.isBlacklisted === true, 'Detection flagged as blacklisted by backend');
  assert(blDetData.data.detection.status === 'Flagged', 'Detection record status is "Flagged"');
  assert(blDetData.data.alert !== null, `Alert object created: ID=${blDetData.data.alert?.id}`);

  // Verify alert in SQLite
  const alertRow = db.prepare('SELECT * FROM alerts WHERE id = ?').get(blDetData.data.alert.id);
  assert(alertRow != null, 'Alert row persisted in SQLite alerts table');
  assert(normalizePlate(alertRow.plate_number) === cleanPlate, `Alert plate matches: ${alertRow.plate_number}`);
  assert(alertRow.status === 'Active', 'Alert status is Active');

  // Verify GET /api/alerts returns this alert
  const alertsListRes = await fetch(`${API_BASE}/api/alerts?status=Active`, { headers: authHeaders });
  const alertsListData = await alertsListRes.json();
  const alertFound = alertsListData.data.some(a => a.id === blDetData.data.alert.id);
  assert(alertFound, 'Alert returned through GET /api/alerts');

  const afterAlertsCount = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'Active'").get().count;
  assert(afterAlertsCount === initialAlertsCount + 1, `Total active alerts incremented: ${initialAlertsCount} -> ${afterAlertsCount}`);

  // ── TEST CASE 4: Non-Blacklisted Plate ──────────────────────────────
  console.log('\n[TEST 4] Non-Blacklisted Plate -> Status Verified + NO Alert:');
  const cleanPlateOnly = 'MH14RT5510';
  await executeWrite((database) => {
    database.prepare('DELETE FROM blacklist WHERE plate_number = ?').run(cleanPlateOnly);
  });

  const beforeAlerts = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'Active'").get().count;

  const cleanRes = await fetch(`${API_BASE}/api/detections`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      plate_number: cleanPlateOnly,
      detection_confidence: 0.91,
      ocr_confidence: 0.98
    })
  });
  const cleanData = await cleanRes.json();
  assert(cleanRes.ok && cleanData.success === true, 'Detection ingested');
  assert(cleanData.data.isBlacklisted === false, 'Detection confirmed NOT blacklisted');
  assert(cleanData.data.detection.status === 'Verified', 'Detection record status is "Verified"');
  assert(cleanData.data.alert === null, 'No alert created for clean plate');

  const afterAlerts = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'Active'").get().count;
  assert(afterAlerts === beforeAlerts, `Active alerts count remained constant (${beforeAlerts})`);

  // ── TEST CASE 5: Image Upload + Job Processing Flow ─────────────────
  console.log('\n[TEST 5] Job Flow: POST /upload -> POST /jobs -> GET /jobs/:id/results:');
  const fileBuffer = fs.readFileSync(TEST_IMAGE);
  const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
  const formData = new FormData();
  formData.append('file', blob, 'test_upload.jpg');

  const uploadRes = await fetch(`${API_BASE}/api/ai/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const uploadData = await uploadRes.json();
  assert(uploadRes.ok && uploadData.success === true, `Image uploaded: uploadId=${uploadData.uploadId}`);

  const jobRes = await fetch(`${API_BASE}/api/ai/jobs`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      uploadId: uploadData.uploadId,
      filename: uploadData.filename,
      filePath: uploadData.filePath,
      type: 'image'
    })
  });
  const jobData = await jobRes.json();
  assert(jobRes.status === 202 && jobData.success === true, `Job created: jobId=${jobData.jobId}`);

  // Poll for completion
  let attempts = 0;
  let jobCompleted = false;
  let jobResults = null;
  while (attempts < 30) {
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
    const rRes = await fetch(`${API_BASE}/api/ai/jobs/${jobData.jobId}/results`, { headers: authHeaders });
    const rData = await rRes.json();
    if (rData.success) {
      jobCompleted = true;
      jobResults = rData;
      break;
    }
  }

  assert(jobCompleted, `Job completed within ${attempts}s`);
  assert(jobResults.events?.length > 0, `Job events returned (${jobResults.events?.length} event(s))`);
  assert(jobResults.observations?.length > 0, `Job observations returned (${jobResults.observations?.length} observation(s))`);
  assert(jobResults.detections?.length > 0, `Operational detections linked to job (${jobResults.detections?.length} detection(s))`);

  // ── TEST CASE 6: Command Dashboard KPIs & PDF Report Generation ──────
  console.log('\n[TEST 6] Dashboard KPIs & Certified Report Integration:');
  const kpisRes = await fetch(`${API_BASE}/api/kpis`, { headers: authHeaders });
  const kpisData = await kpisRes.json();
  assert(kpisRes.ok && kpisData.success === true, 'GET /api/kpis returned 200 OK');
  assert(kpisData.data.platesToday > 0, `KPI platesToday derived from database: ${kpisData.data.platesToday}`);
  assert(kpisData.data.vehiclesTracked > 0, `KPI vehiclesTracked: ${kpisData.data.vehiclesTracked}`);
  assert(kpisData.data.activeAlerts > 0, `KPI activeAlerts derived from database: ${kpisData.data.activeAlerts}`);
  assert(kpisData.data.avgOcrAccuracy > 0, `KPI avgOcrAccuracy: ${kpisData.data.avgOcrAccuracy}%`);

  const repGenRes = await fetch(`${API_BASE}/api/reports/generate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Verification Shift Report', type: 'Shift Summary' })
  });
  const repGenData = await repGenRes.json();
  assert(repGenRes.status === 201 && repGenData.success === true, 'PDF report successfully generated from database');
  assert(fs.existsSync(path.join(PROJECT_ROOT, 'server/data/reports', repGenData.data.file_path)), 'Certified PDF report file exists on disk');

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n==================================================');
  console.log(` Test Results: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('==================================================\n');

  console.log('--- Current Database State ---');
  console.log('Total Detections     :', db.prepare('SELECT COUNT(*) as c FROM detections').get().c);
  console.log('Total Alerts         :', db.prepare('SELECT COUNT(*) as c FROM alerts').get().c);
  console.log('Active Alerts        :', db.prepare("SELECT COUNT(*) as c FROM alerts WHERE status = 'Active'").get().c);
  console.log('Active Blacklist     :', db.prepare("SELECT COUNT(*) as c FROM blacklist WHERE status = 'Active'").get().c);
  console.log('Total anpr_jobs      :', db.prepare('SELECT COUNT(*) as c FROM anpr_jobs').get().c);
  console.log('Total anpr_events    :', db.prepare('SELECT COUNT(*) as c FROM anpr_events').get().c);
  console.log('Total observations   :', db.prepare('SELECT COUNT(*) as c FROM anpr_observations').get().c);

  console.log('\nRecent Persistent Detections:');
  console.table(db.prepare('SELECT id, timestamp, camera_id, plate_number, ocr_confidence, detection_confidence, source_type, status FROM detections ORDER BY id DESC LIMIT 5').all());

  if (failCount === 0) {
    console.log('>>> ALL VERIFICATION TESTS PASSED SUCCESSFULLY! <<<\n');
    process.exit(0);
  } else {
    console.error(`>>> ${failCount} TESTS FAILED! <<<\n`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[FATAL] Verification suite crashed:', err);
  process.exit(1);
});
