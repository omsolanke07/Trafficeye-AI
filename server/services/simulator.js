/**
 * ANPR Simulator (Disabled by default in production)
 * ==================================================
 * Only runs if explicitly enabled via TRAFFICEYE_SIMULATOR=true in .env.
 * Delegates detection processing to detectionService.js.
 */

import { db } from '../db/index.js';
import { broadcast } from './wsServer.js';
import { config } from '../config/index.js';
import { recordDetection } from './detectionService.js';

let intervalTimer = null;

const samplePlates = [
  { plate: 'MH 12 AB 1920', condition: 'Clear', baseConf: 99.4 },
  { plate: 'MH 14 CC 4099', condition: 'Angled Plate', baseConf: 89.2 },
  { plate: 'MH 12 ZY 8172', condition: 'Clear', baseConf: 97.6 },
  { plate: 'MH 12 PQ 3319', condition: 'Motion Blur', baseConf: 83.5 },
  { plate: 'MH 14 RT 5510', condition: 'Clear', baseConf: 98.1 },
  { plate: 'MH 12 NX 9022', condition: 'Low Light', baseConf: 74.3 },
  { plate: 'MH 12 DE 4521', condition: 'Motion Blur', baseConf: 98.4 },
  { plate: 'MH 12 KP 1102', condition: 'Clear', baseConf: 99.1 },
];

/**
 * Backward-compatible detection processor wrapper
 */
export const processDetection = async (params) => {
  return await recordDetection(params);
};

export const startSimulator = () => {
  if (!config.simulatorEnabled) {
    console.log('[Simulator] Disabled by configuration (TRAFFICEYE_SIMULATOR=false).');
    return;
  }

  if (intervalTimer) return;

  console.log('[Simulator] WARNING: ANPR Camera Feed Simulator enabled for development testing.');

  intervalTimer = setInterval(async () => {
    try {
      const cameras = db.prepare(`SELECT id, status FROM cameras WHERE status != 'offline'`).all();
      if (!cameras || cameras.length === 0) return;

      const randomCam = cameras[Math.floor(Math.random() * cameras.length)];
      const sample = samplePlates[Math.floor(Math.random() * samplePlates.length)];
      const confFluctuation = (Math.random() * 4 - 2);
      const conf = Math.min(99.9, Math.max(50.0, parseFloat((sample.baseConf + confFluctuation).toFixed(1))));

      const result = await recordDetection({
        camera_id: randomCam.id,
        plate_number: sample.plate,
        ocr_confidence: conf,
        condition: sample.condition
      });

      // Broadcast over WebSocket
      broadcast('DETECTION', result.detection);
      if (result.alert) {
        broadcast('ALERT', result.alert);
      }
    } catch (err) {
      console.error('[Simulator] Error running simulation tick:', err.message);
    }
  }, config.simulatorIntervalMs);
};

export const stopSimulator = () => {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
    console.log('[Simulator] Simulator stopped.');
  }
};
