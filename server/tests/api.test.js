import assert from 'assert';
import http from 'http';
import { startServer, server } from '../index.js';
import { db } from '../db/index.js';

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}`;

const request = (path, options = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
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
  console.log('\n=============================================================');
  console.log('--- TRAFFICEYE AI DATA-DRIVEN PLATFORM VERIFICATION SUITE ---');
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  };

  try {
    // 1. Healthcheck
    await test('GET /api/health should return 200 OK', async () => {
      const res = await request('/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'ok');
    });

    // 2. Auth - Valid Login
    let authToken = '';
    await test('POST /api/auth/login with admin credentials returns JWT token', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { username: 'deshmukh', password: 'police123' }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.token);
      assert.strictEqual(res.body.data.user.username, 'deshmukh');
      authToken = res.body.data.token;
    });

    // 3. Clean-State Verification: 0 Cameras, 0 Detections, 0 Alerts, 0 Blacklist, 0 Reports
    await test('Clean-State: GET /api/kpis should return exactly 0 for all counts', async () => {
      const res = await request('/api/kpis', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.camerasOnline, 0);
      assert.strictEqual(res.body.data.camerasTotal, 0);
      assert.strictEqual(res.body.data.platesToday, 0);
      assert.strictEqual(res.body.data.activeAlerts, 0);
      assert.strictEqual(res.body.data.vehiclesTracked, 0);
      assert.strictEqual(res.body.data.blacklistMatches, 0);
    });

    await test('Clean-State: GET /api/cameras should return empty array []', async () => {
      const res = await request('/api/cameras', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 0);
    });

    await test('Clean-State: GET /api/blacklist should return empty array []', async () => {
      const res = await request('/api/blacklist', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 0);
    });

    await test('Clean-State: GET /api/alerts should return empty array []', async () => {
      const res = await request('/api/alerts', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 0);
    });

    await test('Clean-State: GET /api/reports should return empty array []', async () => {
      const res = await request('/api/reports', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 0);
    });

    // 4. Real Camera Registration
    await test('POST /api/cameras should register a real camera node', async () => {
      const res = await request('/api/cameras', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          id: 'CAM-GATE-01',
          name: 'Main Security Gate',
          source_type: 'webcam',
          location: 'HQ North Gate',
          fps: 30,
          resolution: '1080p',
          status: 'online'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.data.id, 'CAM-GATE-01');
      assert.strictEqual(res.body.data.source_type, 'webcam');
    });

    await test('KPIs should update to reflect configured camera: camerasTotal=1, camerasOnline=1', async () => {
      const res = await request('/api/kpis', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.camerasTotal, 1);
      assert.strictEqual(res.body.data.camerasOnline, 1);
    });

    // 5. Normal (Non-Blacklisted) Detection — No Alert Triggered
    await test('POST /api/detections with unflagged plate creates Verified detection with 0 alerts', async () => {
      const res = await request('/api/detections', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          camera_id: 'CAM-GATE-01',
          plate_number: 'MH 14 CC 4099',
          ocr_confidence: 96.5,
          condition: 'Clear'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.data.detection.status, 'Verified');
      assert.strictEqual(res.body.data.alert, null);

      // Verify alerts table remains 0
      const alertsRes = await request('/api/alerts', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(alertsRes.body.data.length, 0);
    });

    // 6. Blacklist Registration & Matching Flow
    await test('POST /api/blacklist should register a wanted plate with category and priority', async () => {
      const res = await request('/api/blacklist', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          plate_number: 'MH 12 WANTED 1',
          reason: 'Stolen Vehicle Under Investigation',
          category: 'stolen',
          priority: 'Critical',
          fir_ref: 'FIR-2026/001',
          notes: 'Vehicle reported stolen from Hinjewadi'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.data.plate_number, 'MH 12 WANTED 1');
      assert.strictEqual(res.body.data.category, 'stolen');
      assert.strictEqual(res.body.data.priority, 'Critical');
    });

    await test('POST /api/detections with blacklisted plate triggers real security alert', async () => {
      const res = await request('/api/detections', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          camera_id: 'CAM-GATE-01',
          plate_number: 'MH 12 WANTED 1',
          ocr_confidence: 99.2,
          condition: 'Clear'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.data.detection.status, 'Flagged');
      assert.ok(res.body.data.alert != null);
      assert.strictEqual(res.body.data.alert.severity, 'Critical');

      // Verify active alert is present in alerts endpoint
      const alertsRes = await request('/api/alerts', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(alertsRes.body.data.length, 1);
      assert.strictEqual(alertsRes.body.data[0].plate_number, 'MH 12 WANTED 1');
    });

    // 7. Trajectory Trace Verification
    await test('GET /api/trajectory/:plate should return genuine sightings only', async () => {
      const res = await request('/api/trajectory/MH12WANTED1', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.totalDetections, 1);
      assert.strictEqual(res.body.data.blacklisted, true);
      assert.strictEqual(res.body.data.waypoints[0].cam, 'CAM-GATE-01');
    });

    // 8. Report Generation derived from genuine events
    await test('POST /api/reports/generate creates certified PDF from actual database detections', async () => {
      const res = await request('/api/reports/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: {
          name: 'Operational Shift Audit',
          type: 'Shift Summary'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.data.file_path);

      const reportsRes = await request('/api/reports', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(reportsRes.body.data.length, 1);
    });

  } finally {
    console.log('\n=============================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('=============================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  }
};

// Check if server is already running on port 5000
const ensureServer = async () => {
  try {
    const res = await fetch('http://localhost:5000/api/health');
    if (res.ok) {
      console.log('Backend server already active on port 5000. Testing active instance...');
      return false;
    }
  } catch {}
  await startServer();
  return true;
};

ensureServer().then((weStarted) => {
  runTests().then(() => {
    if (weStarted && server) {
      server.close(() => {
        console.log('Server shut down cleanly.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
}).catch(err => {
  console.error('Test startup failed:', err);
  process.exit(1);
});
