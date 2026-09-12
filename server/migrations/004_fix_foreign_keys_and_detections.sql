-- Migration: 004_fix_foreign_keys_and_detections.sql
-- Makes camera_id nullable in detections and alerts to allow direct media uploads
-- without requiring artificial/invented camera IDs.
-- Adds detection_confidence, source_type, source_path, and bbox to detections.

PRAGMA foreign_keys = OFF;

-- 1. Migrate detections table
CREATE TABLE IF NOT EXISTS detections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  camera_id TEXT REFERENCES cameras(id) ON DELETE SET NULL,
  plate_number TEXT NOT NULL,
  ocr_confidence REAL NOT NULL,
  detection_confidence REAL,
  condition TEXT NOT NULL DEFAULT 'Clear',
  source_type TEXT NOT NULL DEFAULT 'image',
  snapshot_path TEXT,
  bbox TEXT,
  status TEXT NOT NULL DEFAULT 'Verified',
  job_id TEXT
);

INSERT INTO detections_new (id, timestamp, camera_id, plate_number, ocr_confidence, condition, snapshot_path, status, job_id)
SELECT id, timestamp, camera_id, plate_number, ocr_confidence, condition, snapshot_path, status, job_id
FROM detections;

DROP TABLE detections;
ALTER TABLE detections_new RENAME TO detections;

CREATE INDEX IF NOT EXISTS idx_detections_plate ON detections(plate_number);
CREATE INDEX IF NOT EXISTS idx_detections_timestamp ON detections(timestamp);
CREATE INDEX IF NOT EXISTS idx_detections_camera ON detections(camera_id);

-- 2. Migrate alerts table to allow nullable camera_id
CREATE TABLE IF NOT EXISTS alerts_new (
  id TEXT PRIMARY KEY,
  plate_number TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  camera_id TEXT REFERENCES cameras(id) ON DELETE SET NULL,
  location TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  patrol_unit TEXT,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  dispatched_by TEXT,
  dispatched_at TEXT
);

INSERT INTO alerts_new (id, plate_number, alert_type, severity, camera_id, location, timestamp, status, patrol_unit, acknowledged_by, acknowledged_at, dispatched_by, dispatched_at)
SELECT id, plate_number, alert_type, severity, camera_id, location, timestamp, status, patrol_unit, acknowledged_by, acknowledged_at, dispatched_by, dispatched_at
FROM alerts;

DROP TABLE alerts;
ALTER TABLE alerts_new RENAME TO alerts;

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);

PRAGMA foreign_keys = ON;
