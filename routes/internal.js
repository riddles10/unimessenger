import { Router } from 'express';
import { welcomeQueue } from '../queues/welcome.js';

const router = Router();

// Called by Pipsight backend after user registration
router.post('/internal/welcome', async (req, res) => {
  const { userId, name, phone, preferredChannel } = req.body;

  if (!userId || !name || !phone || !preferredChannel) {
    return res.status(400).json({ error: 'Missing required fields: userId, name, phone, preferredChannel' });
  }

  await welcomeQueue.add('send-welcome', {
    userId,
    name,
    phone,
    preferredChannel
  });

  res.json({ ok: true, message: 'Welcome message queued' });
});

export default router;
