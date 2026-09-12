import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { db, executeWrite } from '../db/index.js';

export const generatePdfReport = async ({ name, type, requestedBy }) => {
  const fileName = `Report_${Date.now()}_${type.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  const filePath = path.join(config.reportsDir, fileName);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const writeStream = fs.createWriteStream(filePath);

    doc.pipe(writeStream);

    // Header / Gov Emblem
    doc.fillColor('#14315C')
       .fontSize(18)
       .text('DIRECTORATE OF TRAFFIC POLICE', { align: 'center', characterSpacing: 1 });
    doc.fontSize(10)
       .fillColor('#5C6370')
       .text('PUNE METROPOLITAN REGION · SMART CITY MISSION ANPR CONTROL', { align: 'center' });
    doc.moveDown(0.5);

    doc.strokeColor('#E2E5E9').lineWidth(1)
       .moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.8);

    // Document Title & Metadata
    doc.fillColor('#B3261E')
       .fontSize(9)
       .text('CLASSIFICATION: RESTRICTED // LAW ENFORCEMENT INTERNAL USE ONLY', { align: 'right' });
    doc.moveDown(0.5);

    doc.fillColor('#1F2328')
       .fontSize(14)
       .text(name);
    doc.fontSize(10)
       .fillColor('#4A5568')
       .text(`Report Category: ${type}`)
       .text(`Requested By: ${requestedBy}`)
       .text(`Generated: ${new Date().toLocaleString()} IST`)
       .text(`System Reference: TRAFFICEYE-AI-v4.2.1-CERTIFIED`);
    doc.moveDown(1);

    // Summary Box
    const totalCams = db.prepare('SELECT COUNT(*) as count FROM cameras').get().count;
    const onlineCams = db.prepare("SELECT COUNT(*) as count FROM cameras WHERE status = 'online'").get().count;
    const activeAlerts = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE status = 'Active'").get().count;
    const totalDetections = db.prepare('SELECT COUNT(*) as count FROM detections').get().count;
    const avgRow = db.prepare('SELECT AVG(ocr_confidence) as avg FROM detections').get();
    const avgConf = avgRow && avgRow.avg != null
      ? (Number(avgRow.avg) <= 1.0 ? `${(Number(avgRow.avg) * 100).toFixed(1)}% OCR avg` : `${Number(avgRow.avg).toFixed(1)}% OCR avg`)
      : 'No Scans';

    doc.rect(40, doc.y, 515, 60).fillAndStroke('#F7F8FA', '#E2E5E9');
    const boxY = doc.y + 12;
    doc.fillColor('#14315C').fontSize(11).text('EXECUTIVE TELEMETRY SUMMARY', 52, boxY);
    doc.fillColor('#4A5568').fontSize(9)
       .text(`Total Cameras Deployed: ${totalCams} (${onlineCams} Online)`, 52, boxY + 16)
       .text(`Active Security Alerts: ${activeAlerts}`, 52, boxY + 28)
       .text(`Total Scans Recorded: ${totalDetections}`, 280, boxY + 16)
       .text(`Accuracy Metric: ${avgConf}`, 280, boxY + 28);

    doc.y = boxY + 60;
    doc.moveDown(1.5);

    // Recent High-Priority Detections Table
    doc.fillColor('#14315C').fontSize(12).text('RECENT HIGH-PRIORITY DETECTIONS');
    doc.moveDown(0.5);

    const detections = db.prepare(`
      SELECT d.timestamp, COALESCE(c.ward, c.location, d.camera_id, 'Upload') as sector_loc, d.plate_number, d.ocr_confidence, d.status
      FROM detections d
      LEFT JOIN cameras c ON d.camera_id = c.id
      ORDER BY d.id DESC LIMIT 8
    `).all();

    if (detections.length === 0) {
      doc.fontSize(10).fillColor('#8C95A6').text('No detection records recorded in database.', 52, doc.y + 10);
      doc.moveDown(2);
    } else {
      // Table Header
      const tableTop = doc.y;
      doc.rect(40, tableTop, 515, 20).fill('#EEF1F5');
      doc.fillColor('#14315C').fontSize(9)
         .text('TIME', 45, tableTop + 5)
         .text('CAMERA SECTOR', 110, tableTop + 5)
         .text('LICENSE PLATE', 260, tableTop + 5)
         .text('CONF.', 390, tableTop + 5)
         .text('STATUS', 460, tableTop + 5);

      let rowY = tableTop + 22;
      doc.fillColor('#1F2328');

      for (const det of detections) {
        const confDisplay = det.ocr_confidence != null
          ? (Number(det.ocr_confidence) <= 1.0 ? `${(Number(det.ocr_confidence) * 100).toFixed(1)}%` : `${Number(det.ocr_confidence).toFixed(1)}%`)
          : '—';
        doc.text(det.timestamp, 45, rowY);
        doc.text(det.sector_loc || 'Node', 110, rowY);
        doc.font('Courier-Bold').text(det.plate_number, 260, rowY).font('Helvetica');
        doc.text(confDisplay, 390, rowY);
        doc.text(det.status, 460, rowY);
        rowY += 18;
      }
    }

    // Sign-off section
    doc.moveDown(3);
    doc.fontSize(9).fillColor('#4A5568')
       .text('Authorized Duty Officer Signature:', 40, doc.y)
       .text('_____________________________________', 40, doc.y + 16)
       .text(`${requestedBy} · PCR-04 Control Room`, 40, doc.y + 32);

    doc.end();

    writeStream.on('finish', async () => {
      const stats = fs.statSync(filePath);
      const fileSize = (stats.size / 1024).toFixed(1) + ' KB';

      // Insert record into reports table
      await executeWrite((database) => {
        database.prepare(`
          INSERT INTO reports (name, type, generated_at, requested_by, file_path, file_size)
          VALUES (?, ?, datetime('now'), ?, ?, ?)
        `).run(name, type, requestedBy, fileName, fileSize);
      });

      resolve({ fileName, filePath, fileSize });
    });

    writeStream.on('error', (err) => {
      reject(err);
    });
  });
};
