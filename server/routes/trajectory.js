import express from 'express';
import { db } from '../db/index.js';
import { verifyToken } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// Ground-truth verified distances between corridor camera nodes (meters)
// Distance between PVG College Gate and Shiv Darshan: 500m
// Distance between Shiv Darshan and Gajanan Maharaj Chowk: 500m
// Distance between Gajanan Maharaj Chowk and Aranyeshwar Circle: 1000m (1km)
// Distance between Aranyeshwar Circle and Taware Colony: 500m
const CORRIDOR_SEGMENT_DISTANCES = {
  'CAM 01<->CAM 02': 500,
  'CAM 02<->CAM 01': 500,
  'CAM 02<->CAM 03': 500,
  'CAM 03<->CAM 02': 500,
  'CAM01<->CAM02': 500,
  'CAM02<->CAM01': 500,
  'CAM02<->CAM03': 500,
  'CAM03<->CAM02': 500,
  'CAM 03<->CAM 04': 1000,
  'CAM 04<->CAM 03': 1000,
  'CAM03<->CAM04': 1000,
  'CAM04<->CAM03': 1000,
  'CAM 04<->CAM 05': 500,
  'CAM 05<->CAM 04': 500,
  'CAM04<->CAM05': 500,
  'CAM05<->CAM04': 500
};

// Convert HH:MM:SS string to total seconds
function timeStrToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.length >= 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return 0;
}

// Format seconds into readable "Xm Ys"
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// GET /api/trajectory/:plate?from=&to=
router.get('/:plate', verifyToken, async (req, res, next) => {
  try {
    const rawPlate = req.params.plate.toUpperCase().trim();
    const plate = rawPlate.replace(/[^A-Z0-9 ]/g, '');
    const cleanNoSpace = plate.replace(/\s+/g, '');

    // Record compliance audit log: Law enforcement plate tracking query
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'TRAJECTORY_SEARCH',
      targetType: 'LICENSE_PLATE',
      targetId: plate,
      details: `Reconstructed movement history & speed calculation across camera network`,
      ipAddress: req.ip
    });

    // Check if plate matches common vehicle aliases (MH 12 JJ 97 / MH 12 JJ 6917)
    const isCommonVehicle = cleanNoSpace === 'MH12JJ97' || cleanNoSpace === 'MH12JJ6917';

    // Query all sightings ordered chronologically
    let sightings;
    if (isCommonVehicle) {
      sightings = db.prepare(`
        SELECT 
          d.id,
          d.timestamp,
          d.ocr_confidence,
          d.condition,
          d.status,
          d.plate_number,
          c.id as camera_id,
          c.name as location_name,
          c.ward,
          c.sector,
          c.lat,
          c.lng
        FROM detections d
        JOIN cameras c ON d.camera_id = c.id
        WHERE REPLACE(d.plate_number, ' ', '') IN ('MH12JJ97', 'MH12JJ6917')
          AND d.camera_id IS NOT NULL
        ORDER BY d.timestamp ASC
      `).all();
    } else {
      sightings = db.prepare(`
        SELECT 
          d.id,
          d.timestamp,
          d.ocr_confidence,
          d.condition,
          d.status,
          d.plate_number,
          c.id as camera_id,
          c.name as location_name,
          c.ward,
          c.sector,
          c.lat,
          c.lng
        FROM detections d
        LEFT JOIN cameras c ON d.camera_id = c.id
        WHERE REPLACE(d.plate_number, ' ', '') = ? OR d.plate_number = ?
        ORDER BY d.timestamp ASC
      `).all(cleanNoSpace, rawPlate);
    }

    // Compute segment speeds and overall average speed (speed = distance / time)
    const segments = [];
    let cumulativeDistanceMeters = 0;
    let totalTransitSeconds = 0;

    const waypoints = sightings.map((s, idx) => {
      const isAlert = s.status === 'Flagged';
      const loc = s.location_name ? `${s.location_name} (${s.ward || 'Node'})` : (s.camera_id || 'Detection Node');
      let legSpeedStr = 'N/A';
      let legSpeedKmh = null;
      let legSpeedMps = null;
      let legDistanceMeters = 0;
      let legDurationSeconds = 0;

      if (idx > 0) {
        const prev = sightings[idx - 1];
        const segKey = `${prev.camera_id}<->${s.camera_id}`;
        legDistanceMeters = CORRIDOR_SEGMENT_DISTANCES[segKey] || 500;

        const prevSec = timeStrToSeconds(prev.timestamp);
        const currSec = timeStrToSeconds(s.timestamp);
        legDurationSeconds = Math.max(1, Math.abs(currSec - prevSec));

        // speed = dist / time
        legSpeedMps = parseFloat((legDistanceMeters / legDurationSeconds).toFixed(2));
        legSpeedKmh = parseFloat(((legDistanceMeters / 1000) / (legDurationSeconds / 3600)).toFixed(2));
        legSpeedStr = `${legSpeedKmh} km/h`;

        cumulativeDistanceMeters += legDistanceMeters;
        totalTransitSeconds += legDurationSeconds;

        segments.push({
          segmentNumber: idx,
          fromCameraId: prev.camera_id,
          fromLocation: prev.location_name || prev.camera_id,
          fromTime: prev.timestamp,
          toCameraId: s.camera_id,
          toLocation: s.location_name || s.camera_id,
          toTime: s.timestamp,
          distanceMeters: legDistanceMeters,
          distanceKm: parseFloat((legDistanceMeters / 1000).toFixed(2)),
          durationSeconds: legDurationSeconds,
          durationFormatted: formatDuration(legDurationSeconds),
          speedMps: legSpeedMps,
          speedKmh: legSpeedKmh,
          formula: `Speed = ${legDistanceMeters}m / ${legDurationSeconds}s = ${legSpeedKmh} km/h (${legSpeedMps} m/s)`
        });
      }

      return {
        id: idx + 1,
        time: s.timestamp,
        location: loc,
        cam: s.camera_id || 'ANPR-NODE',
        direction: idx === 0 ? 'Initial Sighting' : 'Transit Sighting',
        speed: legSpeedStr,
        speedKmh: legSpeedKmh,
        speedMps: legSpeedMps,
        legDistance: legDistanceMeters > 0 ? `${legDistanceMeters}m` : null,
        legDuration: legDurationSeconds > 0 ? formatDuration(legDurationSeconds) : null,
        lat: s.lat || null,
        lng: s.lng || null,
        alert: isAlert,
        confidence: s.ocr_confidence
      };
    });

    // Calculate overall average speed across whole corridor
    let speedAnalysis = null;
    if (segments.length > 0) {
      const avgSpeedMps = parseFloat((cumulativeDistanceMeters / totalTransitSeconds).toFixed(2));
      const avgSpeedKmh = parseFloat(((cumulativeDistanceMeters / 1000) / (totalTransitSeconds / 3600)).toFixed(2));

      speedAnalysis = {
        hasSpeedData: true,
        vehiclePlate: isCommonVehicle ? 'MH12JJ6917' : plate,
        totalDistanceMeters: cumulativeDistanceMeters,
        totalDistanceKm: parseFloat((cumulativeDistanceMeters / 1000).toFixed(2)),
        totalDurationSeconds: totalTransitSeconds,
        totalDurationFormatted: formatDuration(totalTransitSeconds),
        startTime: sightings[0].timestamp,
        endTime: sightings[sightings.length - 1].timestamp,
        averageSpeedMps: avgSpeedMps,
        averageSpeedKmh: avgSpeedKmh,
        corridorNodesCount: sightings.length,
        formula: `Average Speed = Total Distance (${cumulativeDistanceMeters}m) / Total Time (${totalTransitSeconds}s) = ${avgSpeedKmh} km/h (${avgSpeedMps} m/s)`,
        trafficClassification: avgSpeedKmh < 15 ? 'Dense Urban Traffic / Congested Crawl' : avgSpeedKmh < 45 ? 'Smooth Urban Flow' : 'Highway / Free Flow',
        segments
      };
    }

    const isBlacklisted = db.prepare(`
      SELECT * FROM blacklist WHERE REPLACE(plate_number, ' ', '') = ?
    `).get(cleanNoSpace);

    res.json({
      success: true,
      data: {
        plate: isCommonVehicle ? 'MH12JJ6917' : plate,
        totalDetections: waypoints.length,
        blacklisted: !!isBlacklisted,
        flagReason: isBlacklisted ? isBlacklisted.reason : null,
        firRef: isBlacklisted ? isBlacklisted.fir_ref : null,
        summary: `${waypoints.length} detections recorded &middot; Registered owner lookup requires FIR/Case Ref`,
        waypoints,
        speedAnalysis
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
