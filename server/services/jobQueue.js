/**
 * ANPR Job Queue
 * ==============
 * SQLite is the persistent source of truth.
 * The in-memory Map is a runtime cache only.
 *
 * On backend restart, jobs stuck in 'processing' are reset to 'failed'
 * (they cannot be resumed because the Python workers are stateless).
 */

import { db, executeWrite } from '../db/index.js';

// Runtime cache: jobId → plain object
const jobCache = new Map();

// ── key conversion helpers ────────────────────────────────────────────────

function snakeToCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function rowToJob(row) {
  const job = {};
  for (const [k, v] of Object.entries(row)) {
    job[snakeToCamel(k)] = v;
  }
  return job;
}

// ── public API ────────────────────────────────────────────────────────────

/**
 * Create a new job record in SQLite and cache it.
 */
export const createJob = async (type, filename, filePath) => {
  const id  = crypto.randomUUID();
  const now = new Date().toISOString();

  await executeWrite((database) => {
    database.prepare(`
      INSERT INTO anpr_jobs (id, type, filename, file_path, status, progress, created_at)
      VALUES (?, ?, ?, ?, 'queued', 0, ?)
    `).run(id, type, filename, filePath, now);
  });

  const job = { id, type, filename, filePath, status: 'queued', progress: 0, createdAt: now };
  jobCache.set(id, job);
  return job;
};

/**
 * Update fields on an existing job in SQLite and cache.
 * Only known column names are accepted to prevent injection.
 */
const ALLOWED_UPDATE_COLS = new Set([
  'status', 'progress', 'total_frames', 'processed_frames',
  'source_fps', 'target_fps', 'image_width', 'image_height',
  'error', 'started_at', 'completed_at',
]);

export const updateJob = async (id, updates) => {
  // Build SET clause from camelCase keys → snake_case columns
  const colUpdates = [];
  const values     = [];

  for (const [camelKey, value] of Object.entries(updates)) {
    const snakeKey = camelKey.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (ALLOWED_UPDATE_COLS.has(snakeKey)) {
      colUpdates.push(`${snakeKey} = ?`);
      values.push(value);
    }
  }

  if (colUpdates.length === 0) return getJob(id);

  await executeWrite((database) => {
    database.prepare(`UPDATE anpr_jobs SET ${colUpdates.join(', ')} WHERE id = ?`).run(...values, id);
  });

  const existing = jobCache.get(id) || {};
  const updated  = { ...existing, id, ...updates };
  jobCache.set(id, updated);
  return updated;
};

/**
 * Get a job by ID (cache-first, then SQLite).
 */
export const getJob = (id) => {
  if (jobCache.has(id)) return jobCache.get(id);

  const row = db.prepare('SELECT * FROM anpr_jobs WHERE id = ?').get(id);
  if (!row) return null;

  const job = rowToJob(row);
  jobCache.set(id, job);
  return job;
};

/**
 * Get events + observations for a completed job.
 */
export const getJobResults = (jobId) => {
  const events = db.prepare(`
    SELECT * FROM anpr_events WHERE job_id = ? ORDER BY track_id ASC
  `).all(jobId).map((row) => {
    const ev = rowToJob(row);
    if (ev.x1 != null && ev.y1 != null && ev.x2 != null && ev.y2 != null) {
      ev.bbox = [ev.x1, ev.y1, ev.x2, ev.y2];
    }
    return ev;
  });

  const observations = db.prepare(`
    SELECT o.* FROM anpr_observations o
    JOIN anpr_events e ON o.event_id = e.id
    WHERE e.job_id = ?
    ORDER BY o.frame_number ASC
  `).all(jobId).map((row) => {
    const obs = rowToJob(row);
    if (obs.x1 != null && obs.y1 != null && obs.x2 != null && obs.y2 != null) {
      obs.bbox = [obs.x1, obs.y1, obs.x2, obs.y2];
    }
    return obs;
  });

  const detections = db.prepare(`
    SELECT * FROM detections WHERE job_id = ? ORDER BY id ASC
  `).all(jobId).map(rowToJob);

  return { events, observations, detections };
};

/**
 * Persist detected plates to SQLite after image/video processing.
 */
export const saveJobResults = async (jobId, plates, jobType = 'image') => {
  const now = new Date().toISOString();

  await executeWrite((database) => {
    const insertEvent = database.prepare(`
      INSERT INTO anpr_events
        (job_id, track_id, vehicle_class, vehicle_confidence, plate_text, raw_ocr_text,
         detection_confidence, ocr_confidence, plate_confidence, validation_status, plate_validation_status,
         first_seen, last_seen, first_seen_at, last_seen_at, first_frame, last_frame, frame_number,
         observation_count, x1, y1, x2, y2, snapshot_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertObs = database.prepare(`
      INSERT INTO anpr_observations
        (event_id, frame_number, timestamp, x1, y1, x2, y2,
         ocr_text, ocr_confidence, detection_confidence, vehicle_class, vehicle_confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const plate of plates) {
      const bbox = plate.bbox || [null, null, null, null];
      const trackId = plate.trackId ?? plate.track_id ?? null;
      const vClass = plate.vehicleClass || plate.vehicle_class || 'Others';
      const vConf = plate.vehicleConfidence ?? plate.vehicle_confidence ?? plate.detectionConfidence ?? null;
      const plateText = plate.plateNumber || plate.plate_text || null;
      const rawText = plate.rawOCRText || plate.raw_ocr_text || null;
      const ocrConf = plate.ocrConfidence ?? plate.plateConfidence ?? plate.plate_confidence ?? null;
      const detConf = plate.detectionConfidence ?? null;
      const valStatus = plate.validationStatus || plate.plate_validation_status || 'invalid';
      const firstSeen = plate.firstSeen ?? plate.first_seen ?? plate.first_seen_at ?? 0;
      const lastSeen = plate.lastSeen ?? plate.last_seen ?? plate.last_seen_at ?? 0;
      const firstFrame = plate.firstFrame ?? plate.first_frame ?? plate.frame_number ?? plate.frameNumber ?? 1;
      const lastFrame = plate.lastFrame ?? plate.last_frame ?? firstFrame;
      const obsCount = plate.observationCount ?? (plate.observations?.length ?? (plateText ? 1 : 0));
      const snapPath = plate.snapshotPath || plate.snapshot_path || null;

      const eventRes = insertEvent.run(
        jobId,
        trackId,
        vClass,
        vConf,
        plateText,
        rawText,
        detConf,
        ocrConf,
        ocrConf,
        valStatus,
        valStatus,
        firstSeen,
        lastSeen,
        firstSeen,
        lastSeen,
        firstFrame,
        lastFrame,
        firstFrame,
        obsCount,
        bbox[0], bbox[1], bbox[2], bbox[3],
        snapPath,
        now,
      );

      const eventId = eventRes.lastInsertRowid;

      // For image jobs, create a single observation from the plate itself
      const observations = plate.observations ?? (jobType === 'image' && plateText
        ? [{
            frame_number: 1,
            timestamp: 0,
            bbox: plate.bbox,
            ocr_text: plateText,
            ocr_confidence: ocrConf,
            detection_confidence: detConf,
            vehicle_class: vClass,
            vehicle_confidence: vConf,
          }]
        : []);

      for (const obs of observations) {
        const obbox = obs.bbox || [null, null, null, null];
        insertObs.run(
          eventId,
          obs.frame_number ?? obs.frameNumber ?? 1,
          obs.timestamp ?? 0,
          obbox[0], obbox[1], obbox[2], obbox[3],
          obs.text ?? obs.ocr_text ?? plateText ?? null,
          obs.confidence ?? obs.ocr_confidence ?? ocrConf ?? null,
          obs.detection_confidence ?? obs.detectionConfidence ?? detConf ?? null,
          obs.vehicle_class ?? vClass,
          obs.vehicle_confidence ?? vConf,
          now,
        );
      }
    }
  });
};

/**
 * On startup, mark any jobs that were mid-processing as failed
 * (they cannot be resumed across restarts).
 */
export const recoverStaleJobs = () => {
  try {
    const stale = db.prepare(
      `SELECT id FROM anpr_jobs WHERE status IN ('queued', 'processing')`
    ).all();

    if (stale.length > 0) {
      db.prepare(
        `UPDATE anpr_jobs SET status = 'failed', error = 'Backend restarted during processing'
         WHERE status IN ('queued', 'processing')`
      ).run();
      console.log(`[JobQueue] Marked ${stale.length} stale job(s) as failed after restart.`);
    }
  } catch (err) {
    console.error('[JobQueue] Failed to recover stale jobs:', err.message);
  }
};
