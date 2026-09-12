import express    from 'express';
import multer     from 'multer';
import path       from 'path';
import fs         from 'fs';
import { fileURLToPath } from 'url';

import { checkHealth, runInference } from '../services/aiService.js';
import { anprService }              from '../services/anprService.js';
import { broadcast }                from '../services/wsServer.js';
import { createJob, updateJob, getJob, getJobResults, saveJobResults } from '../services/jobQueue.js';
import { config }                   from '../config/index.js';
import { verifyToken }              from '../middleware/auth.js';
import { recordAIDetection, normalizeAIResult } from '../services/detectionService.js';

const router     = express.Router();
const __dirname  = path.dirname(fileURLToPath(import.meta.url));

// ── allowed file types ────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXTS = new Set(['.mp4', '.avi', '.mov', '.mkv', '.webm']);
const ALL_EXTS   = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);
const MAX_BYTES  = 500 * 1024 * 1024;   // 500 MB

// ── multer storage ────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename:    (_req,  file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALL_EXTS.has(ext)) return cb(null, true);
  cb(new Error(`Unsupported file type: ${ext}`));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_BYTES } });

// ── helper ────────────────────────────────────────────────────────────────
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return null;
}

// ── existing routes (preserved) ───────────────────────────────────────────

/**
 * GET /api/ai/status
 * Combined status: FastAPI inference service + new ANPR pipeline
 */
router.get('/status', async (req, res, next) => {
  try {
    const [fastapiHealth, anprStatus] = await Promise.all([
      checkHealth().catch(() => ({ ok: false })),
      anprService.isReady()
        ? anprService.getPipelineStatus().catch(() => null)
        : Promise.resolve(null),
    ]);

    res.json({
      success: true,
      fastapi: fastapiHealth.ok ? { status: 'ok', ...fastapiHealth.data } : { status: 'unavailable' },
      anpr: {
        ready:          anprService.isReady(),
        detectorDevice: anprService.detectorDevice,
        ocrDevice:      anprService.ocrDevice,
        ...(anprStatus || {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/infer
 * Backward-compatible direct inference via FastAPI service.
 */
router.post('/infer', async (req, res, next) => {
  try {
    const { image_path, image_base64, conf, camera_id } = req.body;
    if (!image_path && !image_base64) {
      return res.status(400).json({
        success: false,
        error: 'Missing image input: provide image_path or image_base64',
      });
    }

    let result;
    if (anprService.isReady() && image_path) {
      result = await anprService.inferImage(image_path, conf || 0.25);
    } else {
      result = await runInference({ image_path, image_base64, conf });
    }

    // Persist each detected plate via detectionService
    const recordedDetections = [];
    for (const plate of (result.plates || [])) {
      const plateText = plate.plateNumber || plate.plate_number || plate.text || plate.rawOCRText;
      if (plateText) {
        const detRes = await recordAIDetection(plate, {
          camera_id: camera_id || null,
          source_type: 'image',
          source_path: image_path || null,
          condition: 'Clear'
        }).catch(err => {
          console.error('[ANPR] Failed to record operational detection in /infer:', err.message);
          return null;
        });

        if (detRes?.detection) {
          recordedDetections.push(detRes.detection);
        }
      }
    }

    const primaryDetection = recordedDetections[0] || null;

    res.json({
      success: true,
      detection: primaryDetection,
      detections: recordedDetections,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// ── new ANPR upload + job routes ─────────────────────────────────────────

/**
 * POST /api/ai/upload
 * Upload a single image or video file for ANPR processing.
 * Returns uploadId + metadata; does not start processing yet.
 */
router.post('/upload', verifyToken, upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { filename, originalname, size, path: filePath, mimetype } = req.file;
    const fileType = getFileType(filename);

    res.json({
      success:      true,
      uploadId:     filename,           // UUID-based filename used as upload reference
      filename:     originalname,
      savedAs:      filename,
      filePath,
      type:         fileType,
      size,
      mimetype,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/jobs
 * Create an ANPR processing job from a prior upload.
 * Returns immediately with jobId + queued status.
 * Processing runs asynchronously.
 */
router.post('/jobs', verifyToken, async (req, res, next) => {
  try {
    const { uploadId, filename, filePath, type, conf, targetFps, debugVideo, debug_video } = req.body;

    if (!uploadId || !filePath || !type) {
      return res.status(400).json({
        success: false,
        error: 'uploadId, filePath, and type are required',
      });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({
        success: false,
        error: `Uploaded file not found: ${filePath}`,
      });
    }

    const job = await createJob(type, filename || uploadId, filePath);

    broadcast('JOB_QUEUED', { jobId: job.id, type, filename: filename || uploadId });

    // Process asynchronously (do NOT await)
    _processJobAsync(job.id, filePath, type, {
      conf:        parseFloat(conf        || config.anprYoloConf),
      targetFps:   parseInt(targetFps     || config.anprTargetFps, 10),
      debug_video: Boolean(debugVideo || debug_video),
    }).catch((err) => {
      console.error(`[ANPR] Job ${job.id} failed:`, err.message);
    });

    res.status(202).json({
      success: true,
      jobId:   job.id,
      status:  'queued',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/jobs/:jobId
 * Return current job status and progress.
 */
router.get('/jobs/:jobId', verifyToken, (req, res, next) => {
  try {
    const job = getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ai/jobs/:jobId/results
 * Return plate events and frame observations for a completed job.
 */
router.get('/jobs/:jobId/results', verifyToken, (req, res, next) => {
  try {
    const job = getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error:   `Job is not completed (status: ${job.status})`,
        status:  job.status,
        progress: job.progress,
      });
    }
    const results = getJobResults(req.params.jobId);
    res.json({ success: true, job, ...results });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/jobs/:jobId/cancel
 * Request cancellation of an in-progress video job.
 */
router.post('/jobs/:jobId/cancel', verifyToken, async (req, res, next) => {
  try {
    const job = getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    if (!['queued', 'processing'].includes(job.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel job in status: ${job.status}`,
      });
    }

    await anprService.cancelJob(job.id).catch(() => {});
    await updateJob(job.id, { status: 'cancelled', completedAt: new Date().toISOString() });
    broadcast('JOB_CANCELLED', { jobId: job.id });

    res.json({ success: true, jobId: job.id, status: 'cancelled' });
  } catch (err) {
    next(err);
  }
});

// ── async job processor ───────────────────────────────────────────────────

async function _processJobAsync(jobId, filePath, type, opts) {
  const startedAt = new Date().toISOString();
  await updateJob(jobId, { status: 'processing', startedAt });
  broadcast('JOB_STARTED', { jobId, type });

  try {
    let result;

    if (type === 'image') {
      result = await anprService.inferImage(filePath, opts.conf);

      await updateJob(jobId, {
        status:      'completed',
        progress:    100,
        imageWidth:  result.imageWidth,
        imageHeight: result.imageHeight,
        completedAt: new Date().toISOString(),
      });

      const eventsToSave = result.events && result.events.length > 0 ? result.events : (result.plates || []);
      await saveJobResults(jobId, eventsToSave, 'image');

      // Record each detected plate into operational database & check blacklist
      const savedDetections = [];
      for (const plate of eventsToSave) {
        const plateText = plate.plateNumber || plate.plate_number || plate.text || plate.rawOCRText || plate.plate_text;
        if (plateText) {
          const detRes = await recordAIDetection(plate, {
            camera_id: opts.cameraId || null,
            source_type: 'image',
            source_path: filePath,
            job_id: jobId,
            condition: 'Clear'
          }).catch(err => {
            console.error('[ANPR] Failed to record operational detection for image job:', err.message);
            return null;
          });

          if (detRes?.detection) {
            savedDetections.push(detRes.detection);
          }
        }
      }

      broadcast('JOB_COMPLETED', {
        jobId,
        type:        'image',
        plateCount:  result.plates?.length ?? 0,
        vehicleCount: result.vehicles?.length ?? eventsToSave.length,
        plates:      result.plates,
        events:      eventsToSave,
        vehicles:    result.vehicles,
        detections:  savedDetections,
        imageWidth:  result.imageWidth,
        imageHeight: result.imageHeight,
      });

    } else {
      // video — stream progress events
      const onProgress = async (event) => {
        const procFrames = event.processed_frames ?? event.processedFrames ?? 0;
        const totFrames = event.total_frames ?? event.totalFrames ?? 0;
        const progPct = event.progress ?? (totFrames > 0 ? Math.round((procFrames / totFrames) * 100) : 0);

        await updateJob(jobId, {
          progress:        progPct,
          processedFrames: procFrames,
          totalFrames:     totFrames,
        });

        broadcast('JOB_PROGRESS', {
          jobId,
          progress:        progPct,
          progressPercent: progPct,
          processedFrames: procFrames,
          totalFrames:     totFrames,
          fps:             event.fps ?? 0,
          elapsedTime:     event.elapsed_time ?? 0,
          detectionsCount: event.detections_count ?? 0,
          tracksCount:     event.tracks_count ?? 0,
          platesCount:     event.plates_count ?? 0,
        });
      };

      result = await anprService.inferVideo(jobId, filePath, {
        target_fps:  opts.targetFps,
        yolo_conf:   opts.conf,
        debug_video: opts.debug_video,
      }, onProgress);

      if (result.cancelled) {
        await updateJob(jobId, { status: 'cancelled', completedAt: new Date().toISOString() });
        broadcast('JOB_CANCELLED', { jobId });
        return;
      }

      const stats = result.stats || {};
      await updateJob(jobId, {
        status:          'completed',
        progress:        100,
        processedFrames: stats.processedFrames,
        totalFrames:     stats.totalFrames,
        sourceFps:       stats.sourceFps,
        targetFps:       stats.targetFps,
        completedAt:     new Date().toISOString(),
      });

      const eventsToSave = result.events && result.events.length > 0 ? result.events : (result.plates || []);
      await saveJobResults(jobId, eventsToSave, 'video');

      // Record each detected plate into operational database & check blacklist
      const savedDetections = [];
      for (const plate of eventsToSave) {
        const plateText = plate.plateNumber || plate.plate_number || plate.text || plate.rawOCRText || plate.plate_text;
        if (plateText) {
          const detRes = await recordAIDetection(plate, {
            camera_id: opts.cameraId || null,
            source_type: 'video',
            source_path: filePath,
            job_id: jobId,
            condition: 'Clear'
          }).catch(err => {
            console.error('[ANPR] Failed to record operational detection for video job:', err.message);
            return null;
          });

          if (detRes?.detection) {
            savedDetections.push(detRes.detection);
          }
        }
      }

      broadcast('JOB_COMPLETED', {
        jobId,
        type:          'video',
        plateCount:    result.plates?.length ?? 0,
        vehicleCount:  eventsToSave.length,
        events:        eventsToSave,
        plates:        result.plates,
        detections:    savedDetections,
        stats:         result.stats,
        debugVideoUrl: result.stats?.debugVideoUrl || null,
      });
    }

  } catch (err) {
    const errorMsg = err.message || 'Unknown error';
    await updateJob(jobId, {
      status:      'failed',
      error:       errorMsg,
      completedAt: new Date().toISOString(),
    });
    broadcast('JOB_FAILED', { jobId, error: errorMsg });
    throw err;
  }
}

export default router;
