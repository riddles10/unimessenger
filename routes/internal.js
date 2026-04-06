import { Router } from 'express';
import { welcomeQueue } from '../queues/welcome.js';
import { supabase } from '../lib/supabase.js';
import { io } from '../lib/socket.js';

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

// Called by Pipsight after each chat_history insert from the in-app AI flow.
// Pipsight already wrote the row(s) — this endpoint does NOT touch the DB.
// It only resolves user_id → lead_id and broadcasts a `new_message` socket
// event so any agent currently viewing that conversation in Unimessenger sees
// the turn populate live.
//
// Body shape (single row):
//   { user_id, role: 'user' | 'model', content, surface?, platform?, message_id?, created_at? }
//
// If no lead exists yet for that Pipsight user (e.g. they registered before
// Unimessenger was deployed and haven't been onboarded), responds 200 with
// emitted: false. Pipsight should treat this endpoint as fire-and-forget.
router.post('/internal/chat-message', async (req, res) => {
  const { user_id, role, content, surface, platform, message_id, created_at } = req.body || {};

  if (!user_id || !role || !content) {
    return res.status(400).json({ error: 'user_id, role, and content are required' });
  }
  if (!['user', 'model'].includes(role)) {
    return res.status(400).json({ error: 'role must be "user" or "model"' });
  }

  // Resolve user_id → lead. If no lead, there's nothing to update — silently ack.
  const { data: lead, error } = await supabase
    .from('leads')
    .select('id')
    .eq('pipsight_user_id', user_id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!lead) {
    return res.json({ ok: true, emitted: false, reason: 'no_lead_for_user' });
  }

  // Mirror the senderType logic in routes/agents.js → transformChatHistoryRow
  // so messages emitted live match what GET /leads/:leadId/messages returns.
  let senderType = 'user';
  let text = content;
  if (role === 'model') {
    if (text.startsWith('[Agent]: ')) {
      senderType = 'agent';
      text = text.replace(/^\[Agent\]: /, '');
    } else {
      senderType = 'ai';
    }
  }

  const message = {
    id: message_id || `ch_${Date.now()}`,
    text,
    senderType,
    platform: platform || 'app',
    surface: surface || 'app',
    createdAt: created_at || new Date().toISOString(),
  };

  io.emit('new_message', { leadId: lead.id, message });

  // Bump the lead's updated_at so the conversation jumps to the top of the
  // sidebar without requiring a full leads refetch.
  await supabase
    .from('leads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', lead.id);

  res.json({ ok: true, emitted: true, leadId: lead.id });
});

export default router;
