-- Migration: 005_anpr_vehicle_fields.sql
-- Adds UVH-26 vehicle classification, vehicle confidence, plate confidence,
-- plate validation status, and timing fields to anpr_events and anpr_observations.

ALTER TABLE anpr_events ADD COLUMN vehicle_class TEXT;
ALTER TABLE anpr_events ADD COLUMN vehicle_confidence REAL;
ALTER TABLE anpr_events ADD COLUMN plate_confidence REAL;
ALTER TABLE anpr_events ADD COLUMN plate_validation_status TEXT;
ALTER TABLE anpr_events ADD COLUMN first_seen_at REAL;
ALTER TABLE anpr_events ADD COLUMN last_seen_at REAL;
ALTER TABLE anpr_events ADD COLUMN frame_number INTEGER;

ALTER TABLE anpr_observations ADD COLUMN vehicle_class TEXT;
ALTER TABLE anpr_observations ADD COLUMN vehicle_confidence REAL;

CREATE INDEX IF NOT EXISTS idx_anpr_events_vehicle_class ON anpr_events(vehicle_class);
