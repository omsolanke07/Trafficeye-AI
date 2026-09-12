import express from 'express';
import path from 'path';
import fs from 'fs';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { verifyToken } from '../middleware/auth.js';
import { logAudit } from '../middleware/audit.js';
import { generatePdfReport } from '../services/pdfReport.js';

const router = express.Router();

// GET /api/reports
router.get('/', verifyToken, (req, res, next) => {
  try {
    const reports = db.prepare('SELECT * FROM reports ORDER BY id DESC').all();
    res.json({
      success: true,
      data: reports
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/generate
router.post('/generate', verifyToken, async (req, res, next) => {
  try {
    const { name, type } = req.body;

    const reportType = type || 'Shift Summary';
    const reportName = name || `${reportType} — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
    const requestedBy = req.user.name;

    const pdfResult = await generatePdfReport({
      name: reportName,
      type: reportType,
      requestedBy
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'REPORT_GENERATED',
      targetType: 'REPORT',
      targetId: pdfResult.fileName,
      details: `Generated certified ${reportType} PDF report (${pdfResult.fileSize})`,
      ipAddress: req.ip
    });

    const reportRecord = db.prepare('SELECT * FROM reports WHERE file_path = ?').get(pdfResult.fileName);

    res.status(201).json({
      success: true,
      data: reportRecord
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:id/download
router.get('/:id/download', verifyToken, (req, res, next) => {
  try {
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report record not found.' }
      });
    }

    const fullPath = path.join(config.reportsDir, report.file_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'The report file has expired or was removed from disk.' }
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${report.file_path}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
