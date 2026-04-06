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
// Pipsight already wrote the row(s) — this endpoint does NOT touch chat_history.
// It resolves user_id → lead_id (auto-creating a stub lead if none exists yet)
// and broadcasts a `new_message` socket event so any agent currently viewing
// that conversation in Unimessenger sees the turn populate live.
//
// Body shape (single row):
//   { user_id, role: 'user' | 'model', content,
//     name?, email?, phone?,                       // optional Pipsight profile fields
//     surface?, platform?, message_id?, created_at? }
//
// Stub-lead creation: if Pipsight broadcasts a chat_message for a user that
// has never been onboarded (no welcome queue, no Bird inbound, no outbound
// modal), we create a minimal `leads` row on the fly so the conversation is
// immediately visible in the inbox sidebar. Without this, agents only ever
// see leads that originated through one of the messenger flows — every
// in-app-only Pipsight user would be invisible.
router.post('/internal/chat-message', async (req, res) => {
  const {
    user_id, role, content,
    name, email, phone,
    surface, platform, message_id, created_at,
  } = req.body || {};

  if (!user_id || !role || !content) {
    return res.status(400).json({ error: 'user_id, role, and content are required' });
  }
  if (!['user', 'model'].includes(role)) {
    return res.status(400).json({ error: 'role must be "user" or "model"' });
  }

  // Resolve user_id → lead. If no lead exists, create a stub so the
  // conversation becomes visible in the inbox immediately.
  let { data: lead, error } = await supabase
    .from('leads')
    .select('id')
    .eq('pipsight_user_id', user_id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  if (!lead) {
    // Pull profile fields from Pipsight's public.users table so the stub
    // lead lands with a real name/email/phone instead of "Unknown". The
    // request body still wins if Pipsight chose to send these inline.
    let resolvedName = name;
    let resolvedEmail = email;
    let resolvedPhone = phone;

    const { data: profile } = await supabase
      .from('users')
      .select('first_name, last_name, email, phone_number')
      .eq('id', user_id)
      .maybeSingle();

    if (profile) {
      const fullName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (!resolvedName && fullName) resolvedName = fullName;
      if (!resolvedEmail) resolvedEmail = profile.email || null;
      if (!resolvedPhone) resolvedPhone = profile.phone_number || null;
    }

    const { data: created, error: createErr } = await supabase
      .from('leads')
      .insert({
        pipsight_user_id: user_id,
        name: resolvedName || 'Unknown',
        email: resolvedEmail || null,
        phone: resolvedPhone || null,
        stage: 'new_lead',
        mode: 'ai',
        preferred_channel: 'whatsapp',
      })
      .select('id')
      .single();

    if (createErr) {
      console.error('[chat-message] Failed to auto-create stub lead', createErr);
      return res.status(500).json({ error: createErr.message });
    }
    lead = created;
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
