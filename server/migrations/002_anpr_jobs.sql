-- Migration: 002_anpr_jobs.sql
-- ANPR Processing Jobs, Events, and Observations Schema
-- Extends existing schema without modifying any existing tables.

-- ANPR Processing Jobs (image or video uploads)
CREATE TABLE IF NOT EXISTS anpr_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('image', 'video')),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0,
  total_frames INTEGER,
  processed_frames INTEGER,
  source_fps REAL,
  target_fps REAL,
  image_width INTEGER,
  image_height INTEGER,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_anpr_jobs_status ON anpr_jobs(status);
CREATE INDEX IF NOT EXISTS idx_anpr_jobs_created ON anpr_jobs(created_at DESC);

-- One record per unique plate track detected per job
CREATE TABLE IF NOT EXISTS anpr_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES anpr_jobs(id) ON DELETE CASCADE,
  track_id INTEGER,
  plate_text TEXT,
  raw_ocr_text TEXT,
  detection_confidence REAL,
  ocr_confidence REAL,
  validation_status TEXT,
  first_seen REAL,
  last_seen REAL,
  first_frame INTEGER,
  last_frame INTEGER,
  observation_count INTEGER NOT NULL DEFAULT 0,
  x1 REAL,
  y1 REAL,
  x2 REAL,
  y2 REAL,
  snapshot_path TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_anpr_events_job ON anpr_events(job_id);
CREATE INDEX IF NOT EXISTS idx_anpr_events_plate ON anpr_events(plate_text);

-- Individual OCR observations per sampled frame per track
CREATE TABLE IF NOT EXISTS anpr_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES anpr_events(id) ON DELETE CASCADE,
  frame_number INTEGER,
  timestamp REAL,
  x1 REAL,
  y1 REAL,
  x2 REAL,
  y2 REAL,
  ocr_text TEXT,
  ocr_confidence REAL,
  detection_confidence REAL,
  snapshot_path TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_anpr_observations_event ON anpr_observations(event_id);
CREATE INDEX IF NOT EXISTS idx_anpr_observations_frame ON anpr_observations(frame_number);
