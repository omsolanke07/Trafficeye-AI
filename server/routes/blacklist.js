import express from 'express';
import { db, executeWrite } from '../db/index.js';
import { verifyToken } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// GET /api/blacklist?search=&status=
router.get('/', verifyToken, (req, res, next) => {
  try {
    const { search, status } = req.query;
    let query = 'SELECT * FROM blacklist WHERE 1=1';
    const params = [];

    if (search) {
      query += ` AND (plate_number LIKE ? OR reason LIKE ? OR added_by LIKE ? OR category LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status && status !== 'All') {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY id DESC';
    const items = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: items
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/blacklist
router.post('/', verifyToken, async (req, res, next) => {
  try {
    const {
      plate_number,
      reason,
      fir_ref,
      added_by,
      category = 'other',
      priority = 'Medium',
      notes = ''
    } = req.body;

    if (!plate_number || !reason) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'plate_number and reason are required fields.' }
      });
    }

    const cleanPlate = plate_number.toUpperCase().trim();
    const now = new Date().toISOString();

    // Check if already in blacklist
    const existing = db.prepare('SELECT * FROM blacklist WHERE plate_number = ?').get(cleanPlate);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_EXISTS', message: `Plate ${cleanPlate} is already registered in the Blacklist.` }
      });
    }

    const officerName = added_by || req.user.name;

    const insertResult = await executeWrite((database) => {
      const stmt = database.prepare(`
        INSERT INTO blacklist (
          plate_number, reason, fir_ref, added_by, date_added, status, last_seen_at,
          category, priority, notes, created_at, updated_at, created_by
        )
        VALUES (?, ?, ?, ?, datetime('now'), 'Active', 'Pending detection', ?, ?, ?, ?, ?, ?)
      `);
      return stmt.run(
        cleanPlate,
        reason,
        fir_ref || null,
        officerName,
        category,
        priority,
        notes,
        now,
        now,
        officerName
      );
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'BLACKLIST_ADD',
      targetType: 'BLACKLIST',
      targetId: cleanPlate,
      details: `Added flagged plate with reason: ${reason} (Category: ${category}, Priority: ${priority})`,
      ipAddress: req.ip
    });

    const newEntry = db.prepare('SELECT * FROM blacklist WHERE id = ?').get(insertResult.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: newEntry
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/blacklist/:id/status
router.patch('/:id/status', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const entry = db.prepare('SELECT * FROM blacklist WHERE id = ?').get(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Blacklist entry ${id} not found.` }
      });
    }

    const nextStatus = entry.status === 'Active' ? 'Resolved' : 'Active';
    const now = new Date().toISOString();

    await executeWrite((database) => {
      database.prepare('UPDATE blacklist SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, now, id);
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'BLACKLIST_STATUS_TOGGLE',
      targetType: 'BLACKLIST',
      targetId: entry.plate_number,
      details: `Status changed from ${entry.status} to ${nextStatus}`,
      ipAddress: req.ip
    });

    const updated = db.prepare('SELECT * FROM blacklist WHERE id = ?').get(id);

    res.json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/blacklist/:id
router.delete('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const entry = db.prepare('SELECT * FROM blacklist WHERE id = ?').get(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Blacklist entry ${id} not found.` }
      });
    }

    await executeWrite((database) => {
      database.prepare('DELETE FROM blacklist WHERE id = ?').run(id);
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'BLACKLIST_REMOVED',
      targetType: 'BLACKLIST',
      targetId: entry.plate_number,
      details: `Removed plate ${entry.plate_number} from Blacklist`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `Blacklist entry ${id} deleted successfully.`
    });
  } catch (err) {
    next(err);
  }
});

export default router;
