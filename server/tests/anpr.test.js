import assert from 'assert';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { startServer, server } from '../index.js';
import { anprService } from '../services/anprService.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const BASE_URL = `http://localhost:${config.port || 5000}`;

const request = (endpoint, options = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: body });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
};

const runTests = async () => {
  console.log('\n===================================================');
  console.log('--- TRAFFICEYE AI ANPR PIPELINE INTEGRATION TEST ---');
  console.log('===================================================\n');

  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error(err);
      failed++;
    }
  };

  try {
    await startServer();

    // Give pipeline a moment to finish worker startup if needed
    console.log('[Test] Waiting for ANPR pipeline ready state...');
    const t0 = Date.now();
    while (!anprService.isReady() && (Date.now() - t0 < 60000)) {
      await new Promise(r => setTimeout(r, 1000));
    }

    await test('ANPR pipeline initialized successfully', async () => {
      assert.strictEqual(anprService.isReady(), true, 'anprService should be ready');
      assert.notStrictEqual(anprService.detectorDevice, 'unknown', 'YOLO device should be known');
      assert.notStrictEqual(anprService.ocrDevice, 'unknown', 'OCR device should be known');
      console.log(`       YOLO: ${anprService.detectorDevice} | OCR: ${anprService.ocrDevice}`);
    });

    await test('GET /api/ai/status returns ANPR pipeline status', async () => {
      const res = await request('/api/ai/status');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.anpr.ready, true);
    });

    await test('Direct pipeline ping via anprService', async () => {
      const pingRes = await anprService.ping();
      assert.strictEqual(pingRes.event, 'pong');
      assert.strictEqual(pingRes.detector_alive, true);
      assert.strictEqual(pingRes.ocr_alive, true);
    });

    const testImgPath = path.join(PROJECT_ROOT, 'test_image.jpg');
    if (fs.existsSync(testImgPath)) {
      await test('Single image inference via anprService.inferImage', async () => {
        const res = await anprService.inferImage(testImgPath, 0.25);
        assert.strictEqual(res.event, 'completed');
        assert.ok(Array.isArray(res.plates), 'Should return plates array');
        assert.ok(res.plates.length > 0, 'Should detect at least 1 plate');
        console.log(`       Detected plate: ${res.plates[0].plateNumber} (OCR: ${(res.plates[0].ocrConfidence * 100).toFixed(1)}%)`);
      });
    }

    console.log('\n---------------------------------------------------');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('---------------------------------------------------\n');

  } catch (err) {
    console.error('Test run failed with error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
    process.exit(failed > 0 ? 1 : 0);
  }
};

runTests();
