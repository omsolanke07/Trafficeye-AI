import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const VENV_PYTHON = process.platform === 'win32'
  ? path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe')
  : path.join(PROJECT_ROOT, '.venv', 'bin', 'python');

const AI_PORT = process.env.AI_PORT || 8000;
const AI_HOST = process.env.AI_HOST || '127.0.0.1';
const AI_BASE_URL = `http://${AI_HOST}:${AI_PORT}`;

let aiProcess = null;
let isStarting = false;

/**
 * Check if the Python AI service is already responding to health checks.
 */
export const checkHealth = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${AI_BASE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return { ok: true, data };
    }
  } catch {
    // Service not running or still booting
  }
  return { ok: false };
};

/**
 * Automatically start and supervise the Python AI service.
 */
export const initAIService = async () => {
  if (isStarting) return;
  isStarting = true;

  try {
    // 1. Check if already active
    const initialHealth = await checkHealth();
    if (initialHealth.ok) {
      console.log(`[TrafficEye AI] Local AI inference service already active at ${AI_BASE_URL}`);
      isStarting = false;
      return true;
    }

    if (!fs.existsSync(VENV_PYTHON)) {
      console.warn(`[TrafficEye AI] Python virtualenv not found at ${VENV_PYTHON}. AI service auto-start skipped.`);
      isStarting = false;
      return false;
    }

    console.log(`[TrafficEye AI] Spawning Local Python AI Service (YOLO + Awiros OCR) on ${AI_BASE_URL}...`);

    aiProcess = spawn(
      VENV_PYTHON,
      ['-m', 'uvicorn', 'ai.inference:app', '--host', AI_HOST, '--port', String(AI_PORT)],
      {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          OPENBLAS_NUM_THREADS: '1',
          MKL_NUM_THREADS: '1',
          OMP_NUM_THREADS: '1',
        },
      }
    );

    aiProcess.stdout.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) console.log(`[AI-Service] ${msg}`);
    });

    aiProcess.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) console.error(`[AI-Service] ${msg}`);
    });

    aiProcess.on('exit', (code) => {
      console.warn(`[TrafficEye AI] Python AI process exited with code ${code}`);
      aiProcess = null;
    });

    // 2. Poll until /health returns OK (up to 30s)
    const startTime = Date.now();
    while (Date.now() - startTime < 30000) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const health = await checkHealth();
      if (health.ok) {
        console.log(`[TrafficEye AI] Local AI inference service verified ready on ${AI_BASE_URL}`);
        isStarting = false;
        return true;
      }
    }

    console.error('[TrafficEye AI] Python AI service did not become healthy within 30s.');
    isStarting = false;
    return false;
  } catch (err) {
    console.error('[TrafficEye AI] Error initializing AI service:', err);
    isStarting = false;
    return false;
  }
};

/**
 * Execute plate detection & recognition on an image.
 */
export const runInference = async ({ image_path, image_base64, conf = 0.25 }) => {
  const health = await checkHealth();
  if (!health.ok) {
    // Attempt restart if down
    await initAIService();
  }

  const res = await fetch(`${AI_BASE_URL}/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_path, image_base64, conf }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`AI inference service error (${res.status}): ${errorText}`);
  }

  return await res.json();
};

/**
 * Cleanup process on Node server shutdown.
 */
const cleanup = () => {
  if (aiProcess) {
    console.log('[TrafficEye AI] Stopping Python AI process...');
    aiProcess.kill('SIGINT');
    aiProcess = null;
  }
};

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
