import express from 'express';
import { db, executeWrite } from '../db/index.js';
import { verifyToken } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// GET /api/cameras
router.get('/', verifyToken, (req, res, next) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM cameras';
    let params = [];

    if (status && status !== 'all') {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY id ASC';
    const cameras = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: cameras
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/cameras/:id
router.get('/:id', verifyToken, (req, res, next) => {
  try {
    const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id);
    if (!camera) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Camera node ${req.params.id} not found.` }
      });
    }

    res.json({
      success: true,
      data: camera
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/cameras — Add new real camera
router.post('/', verifyToken, async (req, res, next) => {
  try {
    const {
      id,
      name,
      source_type = 'local_stream', // 'webcam' | 'rtsp' | 'video_file' | 'local_stream'
      source_url = '',
      location = '',
      ward = '',
      sector = '',
      lat = 0.0,
      lng = 0.0,
      ip_address = '',
      fps = 30,
      resolution = '1080p',
      status = 'online'
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Camera name is required.' }
      });
    }

    const parsedLat = parseFloat(lat) || 0.0;
    const parsedLng = parseFloat(lng) || 0.0;
    if (parsedLat < -90 || parsedLat > 90) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_COORDINATES', message: 'Latitude must be between -90 and 90.' }
      });
    }
    if (parsedLng < -180 || parsedLng > 180) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_COORDINATES', message: 'Longitude must be between -180 and 180.' }
      });
    }

    const cameraId = id?.trim() || `CAM-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    // Check if camera ID already exists
    const existing = db.prepare('SELECT id FROM cameras WHERE id = ?').get(cameraId);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_EXISTS', message: `Camera ID ${cameraId} already exists.` }
      });
    }

    await executeWrite((database) => {
      database.prepare(`
        INSERT INTO cameras (
          id, name, ward, sector, lat, lng, ip_address, fps, resolution, status,
          source_type, source_url, location, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cameraId,
        name.trim(),
        ward || location || 'Default Ward',
        sector || location || 'Sector 1',
        parsedLat,
        parsedLng,
        ip_address || '127.0.0.1',
        parseInt(fps, 10) || 30,
        resolution || '1080p',
        status || 'online',
        source_type,
        source_url.trim(),
        location.trim(),
        now,
        now
      );
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CAMERA_REGISTERED',
      targetType: 'CAMERA',
      targetId: cameraId,
      details: `Configured camera "${name}" (${source_type}) at (${parsedLat}, ${parsedLng})`,
      ipAddress: req.ip
    });

    const created = db.prepare('SELECT * FROM cameras WHERE id = ?').get(cameraId);

    res.status(201).json({
      success: true,
      data: created
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/cameras/:id — Update camera
router.patch('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(id);

    if (!camera) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Camera node ${id} not found.` }
      });
    }

    const { name, source_type, source_url, location, status, fps, resolution, lat, lng } = req.body;

    let validLat = undefined;
    if (lat !== undefined && lat !== null && lat !== '') {
      validLat = parseFloat(lat);
      if (isNaN(validLat) || validLat < -90 || validLat > 90) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_COORDINATES', message: 'Latitude must be between -90 and 90.' }
        });
      }
    }

    let validLng = undefined;
    if (lng !== undefined && lng !== null && lng !== '') {
      validLng = parseFloat(lng);
      if (isNaN(validLng) || validLng < -180 || validLng > 180) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_COORDINATES', message: 'Longitude must be between -180 and 180.' }
        });
      }
    }

    const now = new Date().toISOString();

    await executeWrite((database) => {
      database.prepare(`
        UPDATE cameras SET
          name = COALESCE(?, name),
          source_type = COALESCE(?, source_type),
          source_url = COALESCE(?, source_url),
          location = COALESCE(?, location),
          status = COALESCE(?, status),
          fps = COALESCE(?, fps),
          resolution = COALESCE(?, resolution),
          lat = COALESCE(?, lat),
          lng = COALESCE(?, lng),
          updated_at = ?
        WHERE id = ?
      `).run(
        name ?? null,
        source_type ?? null,
        source_url ?? null,
        location ?? null,
        status ?? null,
        fps ?? null,
        resolution ?? null,
        validLat ?? null,
        validLng ?? null,
        now,
        id
      );
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CAMERA_UPDATED',
      targetType: 'CAMERA',
      targetId: id,
      details: `Updated camera "${camera.name}" (Lat: ${validLat ?? camera.lat}, Lng: ${validLng ?? camera.lng})`,
      ipAddress: req.ip
    });

    const updated = db.prepare('SELECT * FROM cameras WHERE id = ?').get(id);

    res.json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cameras/:id — Delete camera
router.delete('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(id);

    if (!camera) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Camera node ${id} not found.` }
      });
    }

    await executeWrite((database) => {
      database.prepare('DELETE FROM cameras WHERE id = ?').run(id);
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CAMERA_DELETED',
      targetType: 'CAMERA',
      targetId: id,
      details: `Removed camera "${camera.name}"`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `Camera ${id} deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
});

export default router;
