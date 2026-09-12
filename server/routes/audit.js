import express from 'express';
import { db } from '../db/index.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/audit-log (Restricted to Shift Commander / Full Access)
router.get('/', verifyToken, requireRole(['Shift Commander', 'Full Access']), (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const { user_id, action, from, to } = req.query;

    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];

    if (user_id) {
      query += ' AND user_id = ?';
      params.push(user_id);
    }

    if (action) {
      query += ' AND action = ?';
      params.push(action);
    }

    if (from) {
      query += ' AND timestamp >= ?';
      params.push(from);
    }

    if (to) {
      query += ' AND timestamp <= ?';
      params.push(to);
    }

    query += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);

    const logs = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: logs
    });
  } catch (err) {
    next(err);
  }
});

export default router;
