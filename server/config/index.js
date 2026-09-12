import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'trafficeye-ai-secret-key-gov-restricted-pune-police-2026',
  dbPath: path.resolve(__dirname, '../../server/data/trafficeye.db'),
  reportsDir: path.resolve(__dirname, '../../server/data/reports'),
  snapshotsDir: path.resolve(__dirname, '../../server/data/snapshots'),
  uploadsDir: path.resolve(__dirname, '../../server/data/uploads'),
  simulatorIntervalMs: parseInt(process.env.SIMULATOR_INTERVAL_MS || '5000', 10),
  simulatorEnabled: process.env.TRAFFICEYE_SIMULATOR === 'true',
  anprTargetFps: parseInt(process.env.ANPR_TARGET_FPS || '5', 10),
  anprYoloConf: parseFloat(process.env.ANPR_YOLO_CONF || '0.25'),
};

