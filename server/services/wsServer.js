import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

let wss = null;
const clients = new Set();

export const initWebSocket = (server) => {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // Authenticate WebSocket handshake via JWT in query param ?token=
    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.user = decoded;
        wss.emit('connection', ws, request);
      });
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`[WS] Authenticated operator connected: ${ws.user?.name || ws.user?.username} (${clients.size} total)`);

    // Send welcome status packet
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      data: {
        message: 'Connected to TrafficEye AI real-time telemetry stream',
        user: ws.user,
        timestamp: new Date().toISOString()
      }
    }));

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Operator disconnected (${clients.size} remaining)`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Socket error:', err.message);
      clients.delete(ws);
    });
  });

  return wss;
};

export const broadcast = (type, data) => {
  if (!wss || clients.size === 0) return;

  const payload = JSON.stringify({
    type,
    data,
    timestamp: new Date().toISOString()
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
};
