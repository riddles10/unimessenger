import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { sendViaBird } from '../services/bird.js';
import { io } from '../lib/socket.js';

const router = Router();

// ── Auth middleware ─────────────────────────────────────────────
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing authorization token' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  req.user = user;
  next();
}

// ── Helpers: transform DB rows → frontend shapes ────────────────

function transformLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || 'Unknown',
    phone: row.phone,
    email: row.email,
    channel: row.preferred_channel || 'whatsapp',     // frontend uses 'channel'
    stage: row.stage || 'new_lead',
    intent: row.intent || 'browsing',
    mode: row.mode || 'ai',
    score: row.lead_score || 0,                        // frontend uses 'score'
    notes: row.notes || '',
    shouldAlertAgent: false,                            // managed in-memory by socket
    updated_at: row.updated_at,
    created_at: row.created_at,
    last_read_at: row.last_read_at || null,
    // Computed fields — will be populated separately
    lastMessage: null,
    msgCount: 0,
    unreadCount: 0,
    daysInFunnel: Math.max(1, Math.ceil((Date.now() - new Date(row.created_at).getTime()) / 86400000)),
  };
}

function transformMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    text: row.text,
    senderType: row.sent_by || 'user',                 // frontend uses 'senderType'
    platform: row.platform || 'whatsapp',
    surface: row.surface || 'messenger',
    createdAt: row.created_at,                          // frontend uses 'createdAt'
  };
}

// Transform a chat_history row into the same frontend message shape
function transformChatHistoryRow(row) {
  if (!row) return null;

  // Determine senderType from role + content
  let senderType = 'user';
  let text = row.content;
  if (row.role === 'model') {
    if (text.startsWith('[Agent]: ')) {
      senderType = 'agent';
      text = text.replace(/^\[Agent\]: /, '');
    } else {
      senderType = 'ai';
    }
  }

  return {
    id: row.id,
    text,
    senderType,
    platform: row.platform || 'app',
    surface: row.surface || 'app',
    createdAt: row.created_at,
  };
}

// ── Routes ──────────────────────────────────────────────────────

// Toggle AI / Agent mode for a lead
router.post('/leads/:leadId/mode', authenticate, async (req, res) => {
  const { mode } = req.body; // 'ai' | 'agent'

  if (!['ai', 'agent'].includes(mode)) {
    return res.status(400).json({ error: 'Mode must be "ai" or "agent"' });
  }

  const agentId = req.user.id;

  await supabase.from('leads').update({
    mode,
    assigned_agent_id: mode === 'agent' ? agentId : null,
    updated_at: new Date().toISOString()
  }).eq('id', req.params.leadId);

  io.emit('mode_changed', { leadId: req.params.leadId, mode, agentId });
  res.json({ ok: true });
});

// Agent sends a message manually
router.post('/leads/:leadId/messages', authenticate, async (req, res) => {
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: 'text is required' });

  const agentId = req.user.id;

  const { data: lead } = await supabase
    .from('leads')
    .select('phone, preferred_channel, mode, pipsight_user_id')
    .eq('id', req.params.leadId)
    .single();

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (lead.mode !== 'agent') {
    return res.status(403).json({ error: 'Lead is in AI mode. Switch to agent mode first.' });
  }

  const channelId = lead.preferred_channel === 'telegram'
    ? process.env.BIRD_TELEGRAM_CHANNEL_ID.trim()
    : process.env.BIRD_WHATSAPP_CHANNEL_ID.trim();

  await sendViaBird({ channelId, phone: lead.phone, text });

  const { data: inserted } = await supabase.from('messenger_messages').insert({
    lead_id: req.params.leadId,
    direction: 'outbound',
    text,
    platform: lead.preferred_channel,
    sent_by: 'agent',
    agent_id: agentId
  }).select().single();

  // Also persist to shared chat_history so AI has context if mode switches back
  await supabase.from('chat_history').insert({
    user_id: lead.pipsight_user_id ?? req.params.leadId,
    role: 'model',
    content: `[Agent]: ${text}`,
    surface: 'messenger',
    platform: lead.preferred_channel
  });

  // Emit in the shape the frontend expects
  const msgPayload = {
    id: inserted?.id || `m_${Date.now()}`,
    text,
    senderType: 'agent',
    platform: lead.preferred_channel,
    createdAt: inserted?.created_at || new Date().toISOString(),
  };

  io.emit('new_message', {
    leadId: req.params.leadId,
    message: msgPayload,
  });

  res.json({ ok: true });
});

// Get all leads (for inbox list)
router.get('/leads', authenticate, async (req, res) => {
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Transform and enrich each lead
  const transformed = (leads || []).map(transformLead);

  // Batch-fetch last message + message count from both tables
  const leadIds = transformed.map(l => l.id);

  if (leadIds.length > 0) {
    // Build a map of leadId → pipsight_user_id for chat_history lookups
    const userIdMap = {};
    const lastReadMap = {};
    (leads || []).forEach(row => {
      userIdMap[row.id] = row.pipsight_user_id || row.id;
      lastReadMap[row.id] = row.last_read_at ? new Date(row.last_read_at).getTime() : 0;
    });
    const chatUserIds = [...new Set(Object.values(userIdMap))];

    // Fetch from both tables in parallel.
    // Count queries now also pull the columns we need for unread tracking
    // (direction/role + surface + created_at) so we don't have to do a third
    // round trip per table.
    const [messengerCountRes, messengerLastRes, chatCountRes, chatLastRes] = await Promise.all([
      supabase.from('messenger_messages').select('lead_id, direction, created_at').in('lead_id', leadIds),
      supabase.from('messenger_messages').select('lead_id, text, created_at').in('lead_id', leadIds).order('created_at', { ascending: false }),
      supabase.from('chat_history').select('user_id, role, surface, created_at').in('user_id', chatUserIds),
      supabase.from('chat_history').select('user_id, content, created_at').in('user_id', chatUserIds).order('created_at', { ascending: false })
    ]);

    // Messenger counts + unread (only inbound rows count toward unread)
    const counts = {};
    const unread = {};
    (messengerCountRes.data || []).forEach(row => {
      counts[row.lead_id] = (counts[row.lead_id] || 0) + 1;
      if (row.direction === 'inbound') {
        const lastRead = lastReadMap[row.lead_id] || 0;
        if (new Date(row.created_at).getTime() > lastRead) {
          unread[row.lead_id] = (unread[row.lead_id] || 0) + 1;
        }
      }
    });

    // Chat history counts (map user_id back to lead_id).
    // For unread we only count role='user' rows whose surface='app' — messenger
    // surface rows are mirrors of messenger_messages and would otherwise be
    // double-counted (the bird webhook + getAIResponse both write the same
    // inbound turn into both tables).
    const reverseMap = {};
    Object.entries(userIdMap).forEach(([leadId, userId]) => { reverseMap[userId] = leadId; });
    (chatCountRes.data || []).forEach(row => {
      const leadId = reverseMap[row.user_id] || row.user_id;
      counts[leadId] = (counts[leadId] || 0) + 1;
      if (row.role === 'user' && (row.surface || 'app') === 'app') {
        const lastRead = lastReadMap[leadId] || 0;
        if (new Date(row.created_at).getTime() > lastRead) {
          unread[leadId] = (unread[leadId] || 0) + 1;
        }
      }
    });

    // Last message: pick the most recent across both tables
    const lastMsgMap = {};
    const lastMsgTime = {};

    (messengerLastRes.data || []).forEach(row => {
      if (!lastMsgMap[row.lead_id]) {
        lastMsgMap[row.lead_id] = row.text;
        lastMsgTime[row.lead_id] = new Date(row.created_at).getTime();
      }
    });

    (chatLastRes.data || []).forEach(row => {
      const leadId = reverseMap[row.user_id] || row.user_id;
      const ts = new Date(row.created_at).getTime();
      if (!lastMsgMap[leadId] || ts > lastMsgTime[leadId]) {
        let text = row.content;
        if (text.startsWith('[Agent]: ')) text = text.replace(/^\[Agent\]: /, '');
        lastMsgMap[leadId] = text;
        lastMsgTime[leadId] = ts;
      }
    });

    transformed.forEach(lead => {
      lead.msgCount = counts[lead.id] || 0;
      lead.unreadCount = unread[lead.id] || 0;
      lead.lastMessage = lastMsgMap[lead.id] || null;
    });
  }

  res.json(transformed);
});

// Get messages for a lead — unified feed from messenger_messages + chat_history
router.get('/leads/:leadId/messages', authenticate, async (req, res) => {
  // Look up the lead to get pipsight_user_id for chat_history queries
  const { data: lead } = await supabase
    .from('leads')
    .select('pipsight_user_id')
    .eq('id', req.params.leadId)
    .single();

  const chatUserId = lead?.pipsight_user_id || req.params.leadId;

  // Fetch from both tables in parallel
  const [messengerResult, chatResult] = await Promise.all([
    supabase
      .from('messenger_messages')
      .select('*')
      .eq('lead_id', req.params.leadId)
      .order('created_at', { ascending: true }),
    supabase
      .from('chat_history')
      .select('*')
      .eq('user_id', chatUserId)
      .order('created_at', { ascending: true })
  ]);

  if (messengerResult.error && chatResult.error) {
    return res.status(500).json({ error: messengerResult.error.message });
  }

  const messengerMsgs = (messengerResult.data || []).map(row => ({
    ...transformMessage(row),
    _source: 'messenger',
    _ts: new Date(row.created_at).getTime()
  }));

  const chatMsgs = (chatResult.data || []).map(row => ({
    ...transformChatHistoryRow(row),
    _source: 'chat_history',
    _ts: new Date(row.created_at).getTime()
  }));

  // Merge and sort chronologically
  const merged = [...messengerMsgs, ...chatMsgs].sort((a, b) => a._ts - b._ts);

  // Deduplicate: if a messenger msg and chat_history msg are within 2s
  // with same senderType and similar text, keep only the messenger one (richer metadata)
  const deduped = [];
  for (const msg of merged) {
    const isDupe = deduped.some(existing =>
      Math.abs(existing._ts - msg._ts) < 2000 &&
      existing.senderType === msg.senderType &&
      (existing.text === msg.text || existing.text.includes(msg.text) || msg.text.includes(existing.text))
    );
    if (!isDupe) deduped.push(msg);
  }

  // Strip internal fields before sending
  const result = deduped.map(({ _source, _ts, ...rest }) => rest);
  res.json(result);
});

// Look up a single lead by Pipsight user id, phone, or email.
//
// Used by deep-links from Pipsight's Slack notifications: the Slack button
// hits the Unimessenger frontend with `?pipsight_user_id=<id>` (or `?phone=`),
// which then calls this endpoint to resolve the URL → leadId mapping.
// Returns 404 if no lead exists yet — the frontend handles that by opening
// the "new conversation" modal pre-filled.
router.get('/leads/lookup', authenticate, async (req, res) => {
  const { pipsight_user_id, phone, email } = req.query;

  if (!pipsight_user_id && !phone && !email) {
    return res.status(400).json({ error: 'pipsight_user_id, phone or email is required' });
  }

  let query = supabase.from('leads').select('*').limit(1);
  if (pipsight_user_id) query = query.eq('pipsight_user_id', pipsight_user_id);
  else if (phone) query = query.eq('phone', phone);
  else if (email) query = query.eq('email', email);

  const { data, error } = await query.maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Lead not found' });

  res.json(transformLead(data));
});

// Search leads by name / phone / email (for "New conversation" modal)
router.get('/leads/search', authenticate, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);

  // Escape % and _ for ILIKE, then wrap with wildcards
  const safe = q.replace(/[%_]/g, (c) => `\\${c}`);
  const pattern = `%${safe}%`;

  const { data, error } = await supabase
    .from('leads')
    .select('id, name, phone, email, preferred_channel, stage, mode, pipsight_user_id, updated_at')
    .or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(transformLead));
});

// Start (or continue) an outbound conversation initiated by the support team.
//
// Body shape (one of):
//   { leadId, text, channel? }                       — message an existing lead
//   { phone, name?, email?, channel, text }          — message a brand-new contact
//
// Behavior:
//   - Reuses an existing lead if one matches `leadId` or `phone`
//   - Otherwise creates a new lead row
//   - Forces the lead into 'agent' mode and assigns it to the requesting user
//   - Sends the message via the messaging provider (currently Bird; swap-in point
//     for WhatsApp Cloud API once Meta approval lands)
//   - Persists to messenger_messages + chat_history just like the existing
//     /leads/:leadId/messages flow, and emits the new_message socket event
router.post('/outbound', authenticate, async (req, res) => {
  const { leadId, phone, name, email, channel, text } = req.body || {};
  const agentId = req.user.id;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (!leadId && !phone) {
    return res.status(400).json({ error: 'Either leadId or phone is required' });
  }

  // Resolve or create the lead
  let lead;
  if (leadId) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Lead not found' });
    lead = data;
  } else {
    // Look up by phone first to avoid duplicates
    const { data: existing } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      lead = existing;
    } else {
      const { data: created, error: createErr } = await supabase
        .from('leads')
        .insert({
          name: name || 'Unknown',
          phone,
          email: email || null,
          preferred_channel: channel || 'whatsapp',
          stage: 'new_lead',
          mode: 'agent',
          assigned_agent_id: agentId,
        })
        .select()
        .single();
      if (createErr) return res.status(500).json({ error: createErr.message });
      lead = created;
    }
  }

  // Resolve channel: explicit > lead's preferred > whatsapp
  const platform = channel || lead.preferred_channel || 'whatsapp';

  // Force into agent mode + assign to current user (so the next inbound reply
  // doesn't get auto-answered by the AI before the agent has a chance to handle it)
  const wasAgent = lead.mode === 'agent';
  if (!wasAgent || lead.assigned_agent_id !== agentId) {
    await supabase
      .from('leads')
      .update({
        mode: 'agent',
        assigned_agent_id: agentId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id);
  }

  // Send via the messaging provider
  const channelId = platform === 'telegram'
    ? process.env.BIRD_TELEGRAM_CHANNEL_ID?.trim()
    : process.env.BIRD_WHATSAPP_CHANNEL_ID?.trim();

  let sendError = null;
  try {
    await sendViaBird({ channelId, phone: lead.phone, text });
  } catch (err) {
    sendError = err.message || String(err);
    // We still persist the attempt below so the agent can see what they tried
    // to send, but we surface the failure in the response.
  }

  // Persist outbound message
  const { data: inserted } = await supabase
    .from('messenger_messages')
    .insert({
      lead_id: lead.id,
      direction: 'outbound',
      text,
      platform,
      sent_by: 'agent',
      agent_id: agentId,
    })
    .select()
    .single();

  // Mirror to chat_history so the AI has full context if mode is later flipped back
  await supabase.from('chat_history').insert({
    user_id: lead.pipsight_user_id ?? lead.id,
    role: 'model',
    content: `[Agent]: ${text}`,
    surface: 'messenger',
    platform,
  });

  // Emit so any open inbox sees the message and the (possibly new) lead live
  const msgPayload = {
    id: inserted?.id || `m_${Date.now()}`,
    text,
    senderType: 'agent',
    platform,
    createdAt: inserted?.created_at || new Date().toISOString(),
  };

  io.emit('new_message', { leadId: lead.id, message: msgPayload });
  if (!wasAgent) {
    io.emit('mode_changed', { leadId: lead.id, mode: 'agent', agentId });
  }

  if (sendError) {
    return res.status(502).json({
      ok: false,
      leadId: lead.id,
      error: `Message saved locally but provider rejected it: ${sendError}`,
    });
  }

  res.json({ ok: true, leadId: lead.id });
});

// Mark a lead's conversation as read by stamping last_read_at = now().
// Called by the inbox UI whenever an agent opens a conversation. The frontend
// also clears the lead's unreadCount in local state immediately so the badge
// disappears without waiting on the round-trip.
router.post('/leads/:leadId/read', authenticate, async (req, res) => {
  const { error } = await supabase
    .from('leads')
    .update({ last_read_at: new Date().toISOString() })
    .eq('id', req.params.leadId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Update lead notes
router.patch('/leads/:leadId', authenticate, async (req, res) => {
  const { notes, stage } = req.body;
  const updates = { updated_at: new Date().toISOString() };

  if (notes !== undefined) updates.notes = notes;
  if (stage !== undefined) updates.stage = stage;

  const { error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', req.params.leadId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
