/**
 * Detection Service — Core Operational Ingestion
 * ===============================================
 * The single source of truth for recording genuine vehicle and plate detections.
 * Evaluates detections against active blacklist records and triggers real security alerts.
 * Ensures consistent canonical schema between Python AI and Node.js SQLite persistence.
 */

import { db, executeWrite } from '../db/index.js';
import { broadcast } from './wsServer.js';

/**
 * Normalize license plate text to alphanumeric uppercase for indexing and matching.
 */
export function normalizePlate(plate) {
  if (!plate) return '';
  return String(plate).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Format a plate for clean human display.
 */
export function formatDisplayPlate(cleanPlate, originalText = '') {
  if (originalText && originalText.includes(' ')) {
    return originalText.trim().toUpperCase();
  }
  if (cleanPlate && cleanPlate.length === 10) {
    return `${cleanPlate.slice(0, 2)} ${cleanPlate.slice(2, 4)} ${cleanPlate.slice(4, 6)} ${cleanPlate.slice(6)}`;
  }
  return cleanPlate || originalText || '';
}

/**
 * Create a canonical AI result object from any raw AI worker output.
 */
export function normalizeAIResult(rawPlate, options = {}) {
  const plateText = rawPlate.plate_number
    || rawPlate.plateNumber
    || rawPlate.plate_text
    || rawPlate.text
    || rawPlate.rawOCRText
    || '';

  const cleanPlate = normalizePlate(plateText);

  // Confidence values: unrounded floats
  let detConf = rawPlate.detection_confidence ?? rawPlate.detectionConfidence ?? null;
  if (detConf !== null) detConf = parseFloat(detConf);

  let ocrConf = rawPlate.ocr_confidence ?? rawPlate.ocrConfidence ?? null;
  if (ocrConf !== null) {
    ocrConf = parseFloat(ocrConf);
    // If sent as 0..100 percentage, normalize to 0..1 scale for canonical representation
    if (ocrConf > 1.0) {
      ocrConf = parseFloat((ocrConf / 100).toFixed(4));
    }
  }

  // Normalize bounding box
  let bbox = rawPlate.bbox ?? null;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    bbox = { x1: bbox[0], y1: bbox[1], x2: bbox[2], y2: bbox[3] };
  }

  return {
    success: true,
    plate_number: cleanPlate,
    plate_text: plateText,
    display_plate: formatDisplayPlate(cleanPlate, plateText),
    detection_confidence: detConf,
    ocr_confidence: ocrConf,
    bbox,
    source_type: options.source_type || rawPlate.source_type || 'image',
    source_path: options.source_path || rawPlate.source_path || rawPlate.snapshot_path || null,
    timestamp: options.timestamp || rawPlate.timestamp || new Date().toISOString(),
    camera_id: options.camera_id || rawPlate.camera_id || null,
    vehicle_class: rawPlate.vehicle_class || null,
    validation_status: rawPlate.validation_status || rawPlate.validationStatus || 'valid',
  };
}

/**
 * Process and persist a genuine AI detection into SQLite.
 * Single write path for ALL detections.
 *
 * @param {Object} input - Raw plate object or canonical AI result
 * @param {Object} [options] - Additional operational metadata (camera_id, source_type, job_id, etc.)
 * @returns {Promise<{detection: Object, alert: Object|null, isBlacklisted: boolean}>}
 */
export async function recordAIDetection(input, options = {}) {
  const canonical = normalizeAIResult(input, options);
  const cleanPlate = canonical.plate_number;

  if (!cleanPlate) {
    throw new Error('Valid plate_number is required to record a detection');
  }

  return await executeWrite((database) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const dateStr = now.toISOString().split('T')[0];
    const fullTimestamp = `${dateStr} ${timeStr}`;

    // 1. Resolve Camera Information
    // If a camera_id is provided, verify it actually exists in the database
    let resolvedCameraId = null;
    let camera = null;

    if (canonical.camera_id) {
      camera = database.prepare('SELECT * FROM cameras WHERE id = ?').get(canonical.camera_id);
      if (camera) {
        resolvedCameraId = camera.id;
      }
    }

    const sourceType = resolvedCameraId ? 'camera' : (canonical.source_type || 'upload');

    // 2. Blacklist Matching against genuine registered active entries
    const allActiveBlacklist = database.prepare(`
      SELECT * FROM blacklist WHERE status = 'Active'
    `).all();

    const matchedBlacklist = allActiveBlacklist.find(b => normalizePlate(b.plate_number) === cleanPlate);
    const isBlacklisted = !!matchedBlacklist;

    let status = isBlacklisted ? 'Flagged' : 'Verified';
    if (!isBlacklisted && canonical.ocr_confidence !== null && canonical.ocr_confidence < 0.75) {
      status = 'Review';
    }

    const displayPlate = matchedBlacklist
      ? matchedBlacklist.plate_number
      : canonical.display_plate;

    const bboxJson = canonical.bbox ? JSON.stringify(canonical.bbox) : null;

    // 3. Structured Logging per specification
    console.log(`[AI] Plate detected: ${displayPlate}`);
    console.log(`[AI] Detection confidence: ${canonical.detection_confidence ?? 'N/A'}`);
    console.log(`[AI] OCR confidence: ${canonical.ocr_confidence ?? 'N/A'}`);
    console.log('[AI] Sending result to detectionService');

    // 4. Insert into operational detections table
    const insertDet = database.prepare(`
      INSERT INTO detections (
        timestamp, camera_id, plate_number, ocr_confidence, detection_confidence,
        condition, source_type, snapshot_path, bbox, status, job_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const detResult = insertDet.run(
      timeStr,
      resolvedCameraId,
      displayPlate,
      canonical.ocr_confidence !== null ? canonical.ocr_confidence : 0.95,
      canonical.detection_confidence !== null ? canonical.detection_confidence : 0.95,
      options.condition || 'Clear',
      sourceType,
      canonical.source_path,
      bboxJson,
      status,
      options.job_id || canonical.job_id || null
    );

    const insertedId = detResult.lastInsertRowid;
    console.log(`[DB] Detection inserted: ${insertedId}`);

    // 5. Update Camera Telemetry (if real camera linked)
    if (camera) {
      database.prepare(`
        UPDATE cameras SET last_plate = ?, last_seen = ? WHERE id = ?
      `).run(displayPlate, timeStr, camera.id);
    }

    const cameraName = camera
      ? `${camera.name || camera.id} (${camera.ward || camera.location || 'Node'})`
      : (sourceType === 'upload' || sourceType === 'image' ? 'Media Upload' : (canonical.camera_id || 'Direct Ingestion'));

    const detectionPayload = {
      id: insertedId,
      timestamp: timeStr,
      fullTimestamp,
      camera_id: resolvedCameraId,
      camera_name: cameraName,
      plate_number: displayPlate,
      ocr_confidence: canonical.ocr_confidence,
      detection_confidence: canonical.detection_confidence,
      condition: options.condition || 'Clear',
      source_type: sourceType,
      bbox: canonical.bbox,
      status,
      blacklisted: isBlacklisted
    };

    // 6. Blacklist Alert Creation (ONLY if genuine match found)
    let alertPayload = null;
    if (matchedBlacklist) {
      const alertId = `ALT-${Date.now().toString().slice(-5)}`;
      const category = matchedBlacklist.category || 'Wanted';
      const severity = matchedBlacklist.priority || (
        (matchedBlacklist.reason || '').toLowerCase().includes('wanted') || (matchedBlacklist.reason || '').toLowerCase().includes('stolen')
          ? 'Critical'
          : 'High'
      );
      const locStr = camera
        ? `${camera.location || camera.ward || 'Sector'}, ${camera.name}`
        : 'ANPR Media Upload';

      const alertType = `Blacklist Match (${matchedBlacklist.reason || category})`;

      database.prepare(`
        INSERT INTO alerts (id, plate_number, alert_type, severity, camera_id, location, timestamp, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
      `).run(alertId, displayPlate, alertType, severity, resolvedCameraId, locStr, `${timeStr} IST`);

      database.prepare(`
        UPDATE blacklist SET last_seen_camera_id = ?, last_seen_at = ? WHERE id = ?
      `).run(resolvedCameraId, `${camera?.location || 'Upload'} · ${timeStr}`, matchedBlacklist.id);

      if (camera) {
        database.prepare(`UPDATE cameras SET status = 'alert' WHERE id = ?`).run(camera.id);
      }

      console.log(`[ALERT] Blacklist match detected! Alert created: ${alertId} for ${displayPlate}`);

      alertPayload = {
        id: alertId,
        plate_number: displayPlate,
        alert_type: alertType,
        severity,
        camera_id: resolvedCameraId,
        location: locStr,
        timestamp: `${timeStr} IST`,
        status: 'Active'
      };
    }

    // 7. WebSocket Telemetry Broadcast
    broadcast('DETECTION', detectionPayload);
    if (alertPayload) {
      broadcast('ALERT', alertPayload);
    }

    return {
      detection: detectionPayload,
      alert: alertPayload,
      isBlacklisted
    };
  });
}

/**
 * Backward-compatible wrapper for recordDetection
 */
export async function recordDetection(params) {
  return await recordAIDetection(params, {
    source_type: params.camera_id ? 'camera' : 'upload',
    ...params
  });
}
