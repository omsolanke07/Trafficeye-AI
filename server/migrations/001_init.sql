-- Migration: 001_init.sql
-- Initial schema for TrafficEye AI

-- Cameras table with geolocation
CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ward TEXT NOT NULL,
  sector TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  ip_address TEXT NOT NULL,
  fps INTEGER NOT NULL DEFAULT 30,
  resolution TEXT NOT NULL DEFAULT '4K',
  status TEXT NOT NULL DEFAULT 'online', -- 'online' | 'offline' | 'alert'
  last_plate TEXT,
  last_seen TEXT
);

-- Vehicle detections with spatial & chronological indexes
CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  camera_id TEXT NOT NULL REFERENCES cameras(id),
  plate_number TEXT NOT NULL,
  ocr_confidence REAL NOT NULL,
  condition TEXT NOT NULL,
  snapshot_path TEXT,
  status TEXT NOT NULL DEFAULT 'Verified' -- 'Verified' | 'Flagged' | 'Review'
);

CREATE INDEX IF NOT EXISTS idx_detections_plate ON detections(plate_number);
CREATE INDEX IF NOT EXISTS idx_detections_timestamp ON detections(timestamp);
CREATE INDEX IF NOT EXISTS idx_detections_camera ON detections(camera_id);

-- Blacklist & Flagged Registry
CREATE TABLE IF NOT EXISTS blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate_number TEXT UNIQUE NOT NULL,
  reason TEXT NOT NULL,
  fir_ref TEXT,
  added_by TEXT NOT NULL,
  date_added TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active', -- 'Active' | 'Resolved'
  last_seen_camera_id TEXT REFERENCES cameras(id),
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_blacklist_plate ON blacklist(plate_number);

-- Alerts & Dispatch Events
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  plate_number TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL, -- 'Critical' | 'High' | 'Medium'
  camera_id TEXT NOT NULL REFERENCES cameras(id),
  location TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active', -- 'Active' | 'Acknowledged' | 'Dispatched'
  patrol_unit TEXT,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  dispatched_by TEXT,
  dispatched_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);

-- Official Intelligence Reports
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size TEXT NOT NULL
);

-- System Configuration Parameters
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Authorized Law Enforcement Users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  station TEXT NOT NULL,
  access_level TEXT NOT NULL, -- 'Full Access' | 'Trajectory + Alerts' | 'Live View Only'
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active'
);

-- Immutable Compliance Audit Trail
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  timestamp TEXT NOT NULL,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
