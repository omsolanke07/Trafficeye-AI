/**
 * ANPR Service — Node.js side
 * ===========================
 * Manages the lifecycle of the persistent ai/anpr_pipeline.py process.
 * Communicates via JSON lines over stdin/stdout.
 *
 * Worker isolation:
 *   anpr_pipeline.py → spawns → detector_worker.py  (PyTorch CUDA)
 *   anpr_pipeline.py → spawns → ocr_worker.py        (PaddlePaddle CUDA)
 *
 * Node NEVER spawns or imports the CUDA workers directly.
 */

import { spawn }       from 'child_process';
import { createInterface } from 'readline';
import path            from 'path';
import fs              from 'fs';
import { fileURLToPath } from 'url';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT  = path.resolve(__dirname, '../../');
const VENV_PYTHON   = process.platform === 'win32'
  ? path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe')
  : path.join(PROJECT_ROOT, '.venv', 'bin', 'python');
const PIPELINE_SCRIPT = path.join(PROJECT_ROOT, 'ai', 'anpr_pipeline.py');

// ── service class ─────────────────────────────────────────────────────────

class ANPRService {
  constructor() {
    this._process    = null;
    this._rl         = null;
    this._ready      = false;
    this._startPromise = null;

    // request_id → { resolve, reject, onProgress }
    this._pending    = new Map();

    // serial queue: only one request is in-flight at a time
    this._queue      = [];
    this._busy       = false;

    // worker metadata
    this.detectorDevice = 'unknown';
    this.ocrDevice      = 'unknown';

    // startup resolve/reject refs
    this._startupResolve = null;
    this._startupReject  = null;
  }

  // ── public lifecycle ────────────────────────────────────────

  async init() {
    if (this._ready) return;
    if (this._startPromise) return this._startPromise;
    this._startPromise = this._start();
    return this._startPromise;
  }

  isReady() {
    return this._ready && this._process !== null;
  }

  getStatus() {
    return {
      ready:          this._ready,
      detectorDevice: this.detectorDevice,
      ocrDevice:      this.ocrDevice,
      queueDepth:     this._queue.length,
      busy:           this._busy,
    };
  }

  // ── private startup ─────────────────────────────────────────

  _start() {
    if (!fs.existsSync(VENV_PYTHON)) {
      return Promise.reject(new Error(`Python venv not found: ${VENV_PYTHON}`));
    }
    if (!fs.existsSync(PIPELINE_SCRIPT)) {
      return Promise.reject(new Error(`ANPR pipeline script not found: ${PIPELINE_SCRIPT}`));
    }

    return new Promise((resolve, reject) => {
      this._startupResolve = resolve;
      this._startupReject  = reject;

      const timeout = setTimeout(() => {
        reject(new Error('[ANPR] Pipeline startup timed out (90 s)'));
      }, 90_000);

      const _clearAndResolve = () => { clearTimeout(timeout); resolve(); };
      const _clearAndReject  = (e) => { clearTimeout(timeout); reject(e); };

      this._startupResolve = _clearAndResolve;
      this._startupReject  = _clearAndReject;

      this._process = spawn(VENV_PYTHON, [PIPELINE_SCRIPT], {
        cwd:   PROJECT_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        env:   {
          ...process.env,
          PYTHONUNBUFFERED:   '1',
          OPENBLAS_NUM_THREADS: '1',
          MKL_NUM_THREADS:    '1',
          OMP_NUM_THREADS:    '1',
        },
      });

      this._rl = createInterface({ input: this._process.stdout, crlfDelay: Infinity });
      this._rl.on('line', (line) => this._handleLine(line));

      this._process.stderr.on('data', (chunk) => {
        const msg = chunk.toString().trim();
        if (msg) console.log(`[ANPR-Worker] ${msg}`);
      });

      this._process.on('error', (err) => {
        console.error('[ANPR] Spawn error:', err.message);
        if (!this._ready) _clearAndReject(err);
        this._onExit(-1);
      });

      this._process.on('exit', (code) => {
        console.warn(`[ANPR] Pipeline process exited (code ${code})`);
        this._onExit(code);
      });
    });
  }

  _onExit(code) {
    this._ready       = false;
    this._startPromise = null;
    this._process     = null;
    this._rl          = null;
    this._busy        = false;

    // Reject all in-flight requests
    for (const [, handler] of this._pending) {
      handler.reject(new Error(`ANPR pipeline exited unexpectedly (code ${code})`));
    }
    this._pending.clear();

    // Drain queue
    for (const { reject } of this._queue) {
      reject(new Error('ANPR pipeline unavailable'));
    }
    this._queue.length = 0;
  }

  // ── line handler ────────────────────────────────────────────

  _handleLine(line) {
    line = line.trim();
    if (!line.startsWith('{')) return;

    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    // ── startup sequence ──
    if (!this._ready) {
      if (msg.status === 'ready') {
        this._ready         = true;
        this.detectorDevice = msg.detector_device || 'unknown';
        this.ocrDevice      = msg.ocr_device      || 'unknown';
        console.log(`[ANPR] Pipeline ready — YOLO: ${this.detectorDevice} | OCR: ${this.ocrDevice}`);
        this._startupResolve?.();
      } else if (msg.status === 'error') {
        this._startupReject?.(new Error(msg.error || 'ANPR startup error'));
      }
      return;
    }

    // ── normal operation ──
    const rid     = msg.request_id;
    const handler = this._pending.get(rid);
    if (!handler) return;

    switch (msg.event) {
      case 'progress':
        handler.onProgress?.(msg);
        break;

      case 'completed':
      case 'pong':
      case 'status':
      case 'cancelled':
        this._pending.delete(rid);
        this._busy = false;
        handler.resolve(msg);
        this._processQueue();
        break;

      case 'error':
        this._pending.delete(rid);
        this._busy = false;
        handler.reject(new Error(msg.error || 'ANPR pipeline error'));
        this._processQueue();
        break;
    }
  }

  // ── queue ───────────────────────────────────────────────────

  _enqueue(request, onProgress) {
    return new Promise((resolve, reject) => {
      this._queue.push({ request, resolve, reject, onProgress });
      this._processQueue();
    });
  }

  _processQueue() {
    if (this._busy || this._queue.length === 0 || !this._process || !this._ready) return;
    this._busy = true;

    const { request, resolve, reject, onProgress } = this._queue.shift();
    this._pending.set(request.request_id, { resolve, reject, onProgress });

    try {
      this._process.stdin.write(JSON.stringify(request) + '\n');
    } catch (err) {
      this._pending.delete(request.request_id);
      this._busy = false;
      reject(err);
    }
  }

  // ── send helper ─────────────────────────────────────────────

  async _send(action, payload = {}, onProgress = null) {
    if (!this._ready) {
      await this.init();
    }
    const request_id = crypto.randomUUID();
    return this._enqueue({ request_id, action, ...payload }, onProgress);
  }

  // ── public API ───────────────────────────────────────────────

  ping() {
    return this._send('ping');
  }

  getPipelineStatus() {
    return this._send('status');
  }

  /**
   * Run full ANPR pipeline on a single image.
   * @param {string} imagePath  Absolute path to uploaded image.
   * @param {number} conf       YOLO confidence threshold.
   */
  inferImage(imagePath, conf = 0.25) {
    return this._send('infer_image', { image_path: imagePath, conf });
  }

  /**
   * Run full ANPR pipeline on a video file.
   * Processing is serial — one video at a time.
   * @param {string}   jobId      Job UUID.
   * @param {string}   videoPath  Absolute path to uploaded video.
   * @param {object}   opts       Processing options.
   * @param {function} onProgress Called with progress event objects.
   */
  inferVideo(jobId, videoPath, opts = {}, onProgress = null) {
    return this._send('infer_video', {
      job_id:     jobId,
      video_path: videoPath,
      ...opts,
    }, onProgress);
  }

  /**
   * Request cancellation of a running video job.
   * The pipeline checks the flag at each sampled frame.
   */
  cancelJob(jobId) {
    return this._send('cancel', { job_id: jobId });
  }

  /**
   * Restart the pipeline process cleanly.
   */
  async restart() {
    if (this._process) {
      try {
        this._process.kill('SIGTERM');
      } catch {}
    }
    this._onExit(0);
    return this.init();
  }
}

// ── singleton export ──────────────────────────────────────────────────────

export const anprService = new ANPRService();

export const initANPRPipeline = async () => {
  try {
    console.log('[ANPR] Starting ANPR pipeline (YOLO + Awiros OCR workers)…');
    await anprService.init();
    return true;
  } catch (err) {
    console.error('[ANPR] Pipeline init failed:', err.message);
    console.error('[ANPR] ANPR upload/process features will be unavailable until restart.');
    return false;
  }
};

const cleanupANPR = () => {
  if (anprService._process) {
    try {
      anprService._process.kill('SIGTERM');
    } catch {}
  }
};

process.on('exit', cleanupANPR);
process.on('SIGINT', () => { cleanupANPR(); process.exit(0); });
process.on('SIGTERM', () => { cleanupANPR(); process.exit(0); });

