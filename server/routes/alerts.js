import express from 'express';
import { db, executeWrite } from '../db/index.js';
import { verifyToken } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { broadcast } from '../services/wsServer.js';

const router = express.Router();

// GET /api/alerts?status=
router.get('/', verifyToken, (req, res, next) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM alerts';
    const params = [];

    if (status && status !== 'all') {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY timestamp DESC';
    const alerts = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: alerts
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/alerts/:id/acknowledge
router.patch('/:id/acknowledge', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Alert ${id} not found.` }
      });
    }

    await executeWrite((database) => {
      database.prepare(`
        UPDATE alerts 
        SET status = 'Acknowledged', acknowledged_by = ?, acknowledged_at = datetime('now')
        WHERE id = ?
      `).run(req.user.name, id);
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'ALERT_ACKNOWLEDGED',
      targetType: 'ALERT',
      targetId: id,
      details: `Alert for ${alert.plate_number} acknowledged by ${req.user.name}`,
      ipAddress: req.ip
    });

    const updatedAlert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    broadcast('ALERT_ACKNOWLEDGED', updatedAlert);

    res.json({
      success: true,
      data: updatedAlert
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/alerts/:id/dispatch
router.post('/:id/dispatch', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { patrol_unit, directive } = req.body;

    const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Alert ${id} not found.` }
      });
    }

    const assignedUnit = patrol_unit || 'PCR-18 (Hinjewadi)';

    await executeWrite((database) => {
      database.prepare(`
        UPDATE alerts 
        SET status = 'Dispatched', patrol_unit = ?, dispatched_by = ?, dispatched_at = datetime('now')
        WHERE id = ?
      `).run(assignedUnit, req.user.name, id);
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UNIT_DISPATCHED',
      targetType: 'ALERT',
      targetId: id,
      details: `Dispatched ${assignedUnit} for target ${alert.plate_number}. Directive: ${directive || 'Intercept and Detain'}`,
      ipAddress: req.ip
    });

    const updatedAlert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
    broadcast('DISPATCH', updatedAlert);

    res.json({
      success: true,
      data: updatedAlert
    });
  } catch (err) {
    next(err);
  }
});

export default router;
