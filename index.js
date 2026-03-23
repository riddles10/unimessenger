import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initSocket } from './lib/socket.js';
import { startWelcomeWorker } from './queues/welcome.js';
import webhookRouter from './routes/webhook.bird.js';
import agentsRouter from './routes/agents.js';
import internalRouter from './routes/internal.js';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use(webhookRouter);
app.use('/api', agentsRouter);
app.use(internalRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'unimessenger' });
});

// Initialize Socket.io
initSocket(httpServer);

// Start BullMQ welcome worker
startWelcomeWorker();

// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Unimessenger] Server running on port ${PORT}`);
  console.log(`[Unimessenger] Webhook endpoint: POST /webhook/bird`);
  console.log(`[Unimessenger] Health check: GET /health`);
});
