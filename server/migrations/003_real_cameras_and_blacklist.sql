-- Migration: 003_real_cameras_and_blacklist.sql
-- Adds real camera source fields and extended blacklist metadata

-- Camera source and management columns
ALTER TABLE cameras ADD COLUMN source_type TEXT DEFAULT 'local_stream'; -- 'webcam' | 'rtsp' | 'video_file' | 'local_stream'
ALTER TABLE cameras ADD COLUMN source_url TEXT DEFAULT '';
ALTER TABLE cameras ADD COLUMN location TEXT DEFAULT '';
ALTER TABLE cameras ADD COLUMN created_at TEXT DEFAULT '';
ALTER TABLE cameras ADD COLUMN updated_at TEXT DEFAULT '';

-- Blacklist extended categorization and audit columns
ALTER TABLE blacklist ADD COLUMN category TEXT DEFAULT 'other'; -- 'stolen' | 'wanted' | 'suspicious' | 'watchlist' | 'other'
ALTER TABLE blacklist ADD COLUMN priority TEXT DEFAULT 'Medium'; -- 'Critical' | 'High' | 'Medium' | 'Low'
ALTER TABLE blacklist ADD COLUMN created_at TEXT DEFAULT '';
ALTER TABLE blacklist ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE blacklist ADD COLUMN created_by TEXT DEFAULT '';
ALTER TABLE blacklist ADD COLUMN notes TEXT DEFAULT '';
