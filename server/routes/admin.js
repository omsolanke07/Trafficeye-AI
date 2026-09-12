import express from 'express';
import { db, executeWrite } from '../db/index.js';
import { verifyToken, requireRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// GET /api/admin/users
router.get('/users', verifyToken, (req, res, next) => {
  try {
    const users = db.prepare(`
      SELECT id, username, name, role, station, access_level, status
      FROM users
      ORDER BY id ASC
    `).all();

    res.json({
      success: true,
      data: users
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/status (Shift Commander only)
router.patch('/users/:id/status', verifyToken, requireRole(['Shift Commander', 'Full Access']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `User ${id} not found.` }
      });
    }

    const nextStatus = user.status === 'Active' ? 'Suspended' : 'Active';

    await executeWrite((database) => {
      database.prepare('UPDATE users SET status = ? WHERE id = ?').run(nextStatus, id);
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'USER_STATUS_CHANGE',
      targetType: 'USER',
      targetId: String(id),
      details: `Changed officer ${user.name} status to ${nextStatus}`,
      ipAddress: req.ip
    });

    const updated = db.prepare('SELECT id, username, name, role, station, access_level, status FROM users WHERE id = ?').get(id);

    res.json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/config
router.get('/config', verifyToken, (req, res, next) => {
  try {
    const rows = db.prepare('SELECT key, value FROM system_config').all();
    const configMap = {};
    for (const r of rows) {
      configMap[r.key] = r.value;
    }

    res.json({
      success: true,
      data: configMap
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/config
router.post('/config', verifyToken, requireRole(['Shift Commander', 'Full Access']), async (req, res, next) => {
  try {
    const { ocr_threshold, sound_alerts, auto_dispatch } = req.body;

    await executeWrite((database) => {
      const stmt = database.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)');
      if (ocr_threshold !== undefined) stmt.run('ocr_threshold', String(ocr_threshold));
      if (sound_alerts !== undefined) stmt.run('sound_alerts', String(sound_alerts));
      if (auto_dispatch !== undefined) stmt.run('auto_dispatch', String(auto_dispatch));
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'CONFIG_UPDATE',
      targetType: 'SYSTEM_CONFIG',
      targetId: 'INFERENCE_PARAMS',
      details: `Updated thresholds: OCR=${ocr_threshold}%, Sound=${sound_alerts}, AutoDispatch=${auto_dispatch}`,
      ipAddress: req.ip
    });

    const rows = db.prepare('SELECT key, value FROM system_config').all();
    const configMap = {};
    for (const r of rows) {
      configMap[r.key] = r.value;
    }

    res.json({
      success: true,
      data: configMap
    });
  } catch (err) {
    next(err);
  }
});

export default router;
