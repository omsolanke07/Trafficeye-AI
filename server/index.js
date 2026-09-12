import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config/index.js';
import { runMigrations } from './migrations/migrate.js';
import { seedDatabase } from './seeds/seed.js';
import { initWebSocket } from './services/wsServer.js';
import { startSimulator } from './services/simulator.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initANPRPipeline } from './services/anprService.js';
import { recoverStaleJobs } from './services/jobQueue.js';

// Route Imports
import authRoutes from './routes/auth.js';
import kpisRoutes from './routes/kpis.js';
import camerasRoutes from './routes/cameras.js';
import detectionsRoutes from './routes/detections.js';
import trajectoryRoutes from './routes/trajectory.js';
import alertsRoutes from './routes/alerts.js';
import blacklistRoutes from './routes/blacklist.js';
import analyticsRoutes from './routes/analytics.js';
import reportsRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import auditRoutes from './routes/audit.js';
import aiRoutes from './routes/ai.js';
import { initAIService } from './services/aiService.js';

const app = express();
const server = http.createServer(app);

// Global Middleware
app.use(cors());
app.use(express.json());
app.use('/snapshots', express.static(config.snapshotsDir));
app.use('/videos', express.static(path.resolve('public/videos')));

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'TrafficEye AI - Law Enforcement Intelligence Core',
    version: '4.2.1-gov',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/kpis', kpisRoutes);
app.use('/api/cameras', camerasRoutes);
app.use('/api/detections', detectionsRoutes);
app.use('/api/trajectory', trajectoryRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/blacklist', blacklistRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/audit-log', auditRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/anpr', aiRoutes);

// Serve Static Frontend (Vite Production Build)
const distPath = path.resolve('dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/snapshots') && !req.path.startsWith('/ws')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// Centralized Error Handler
app.use(errorHandler);

// Bootstrap Server, Database, WebSocket & Simulator
export const startServer = async () => {
  try {
    console.log('[TrafficEye AI] Bootstrapping backend server...');
    
    // 1. Run database migrations
    runMigrations();

    // 2. Run seed data if not seeded
    await seedDatabase();

    // 3. Initialize WebSocket Server
    initWebSocket(server);

    // 4. Simulator (Gated strictly behind TRAFFICEYE_SIMULATOR=true, default false)
    if (config.simulatorEnabled) {
      startSimulator();
    } else {
      console.log('[TrafficEye AI] ANPR Simulator disabled. Running in 100% data-driven mode.');
    }

    // 5. Recover any jobs interrupted by previous restart
    recoverStaleJobs();

    // 6. Initialize ANPR Pipeline (YOLO + Awiros OCR workers)
    initANPRPipeline().catch(err => console.error('[TrafficEye AI] ANPR Pipeline boot warning:', err));

    // 7. Initialize Legacy FastAPI AI Service (optional, opt-in)
    //    Disabled by default to prevent duplicate worker processes and CUDA resource contention
    if (process.env.ENABLE_LEGACY_AI_SERVICE === 'true') {
      setTimeout(() => {
        initAIService().catch(err => console.error('[TrafficEye AI] AI Service boot warning:', err));
      }, 40_000);
    }

    // 8. Listen
    server.listen(config.port, () => {
      console.log(`[TrafficEye AI] REST API running at http://localhost:${config.port}`);
      console.log(`[TrafficEye AI] WebSocket running at ws://localhost:${config.port}/ws`);
    });

    return server;
  } catch (err) {
    console.error('[TrafficEye AI] Failed to start backend:', err);
    process.exit(1);
  }
};

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startServer();
}

export { app, server };
