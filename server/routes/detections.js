import express from 'express';
import { db } from '../db/index.js';
import { verifyToken } from '../middleware/auth.js';
import { recordAIDetection } from '../services/detectionService.js';

const router = express.Router();

// GET /api/detections?sector=&camera_id=&limit=&cursor=
router.get('/', verifyToken, (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 500);
    const { sector, camera_id, cursor } = req.query;

    let query = `
      SELECT 
        d.*, 
        COALESCE(c.name, d.camera_id, 'Upload / Direct Ingestion') as camera_name, 
        c.ward, 
        c.sector
      FROM detections d
      LEFT JOIN cameras c ON d.camera_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (cursor) {
      query += ` AND d.id < ?`;
      params.push(parseInt(cursor, 10));
    }

    if (sector && sector !== 'All') {
      query += ` AND (c.sector LIKE ? OR c.ward LIKE ?)`;
      params.push(`%${sector}%`, `%${sector}%`);
    }

    if (camera_id) {
      query += ` AND d.camera_id = ?`;
      params.push(camera_id);
    }

    query += ` ORDER BY d.id DESC LIMIT ?`;
    params.push(limit);

    const detections = db.prepare(query).all(...params).map(row => ({
      ...row,
      blacklisted: row.status === 'Flagged',
      bbox: row.bbox ? (() => { try { return JSON.parse(row.bbox); } catch { return row.bbox; } })() : null
    }));

    const nextCursor = detections.length === limit ? detections[detections.length - 1].id : null;

    res.json({
      success: true,
      data: {
        items: detections,
        nextCursor
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/detections (Manual, external sensor, or AI ingestion)
router.post('/', verifyToken, async (req, res, next) => {
  try {
    const {
      camera_id,
      plate_number,
      ocr_confidence,
      detection_confidence,
      condition,
      snapshot_path,
      source_type,
      bbox
    } = req.body;

    if (!plate_number) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'plate_number is required.' }
      });
    }

    const result = await recordAIDetection({
      plate_number: plate_number.toUpperCase().trim(),
      detection_confidence: detection_confidence != null ? parseFloat(detection_confidence) : 0.95,
      ocr_confidence: ocr_confidence != null ? parseFloat(ocr_confidence) : 0.95,
      camera_id: camera_id || null,
      source_type: source_type || (camera_id ? 'camera' : 'upload'),
      snapshot_path: snapshot_path || null,
      condition: condition || 'Clear',
      bbox: bbox || null
    });

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

export default router;
