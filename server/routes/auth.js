import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { verifyToken } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Username and password are required.' }
      });
    }

    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid officer username or password.' }
      });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Your account is suspended. Contact Shift Commander.' }
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid officer username or password.' }
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        station: user.station,
        accessLevel: user.access_level
      },
      config.jwtSecret,
      { expiresIn: '12h' }
    );

    // Audit log
    await logAudit({
      userId: user.id,
      username: user.username,
      action: 'LOGIN',
      targetType: 'AUTH',
      targetId: String(user.id),
      details: `Officer logged into station ${user.station}`,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          station: user.station,
          accessLevel: user.access_level
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, (req, res) => {
  res.json({
    success: true,
    data: { user: req.user }
  });
});

export default router;
