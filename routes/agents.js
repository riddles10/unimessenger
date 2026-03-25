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
    // Computed fields — will be populated separately
    lastMessage: null,
    msgCount: 0,
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
    (leads || []).forEach(row => {
      userIdMap[row.id] = row.pipsight_user_id || row.id;
    });
    const chatUserIds = [...new Set(Object.values(userIdMap))];

    // Fetch from both tables in parallel
    const [messengerCountRes, messengerLastRes, chatCountRes, chatLastRes] = await Promise.all([
      supabase.from('messenger_messages').select('lead_id').in('lead_id', leadIds),
      supabase.from('messenger_messages').select('lead_id, text, created_at').in('lead_id', leadIds).order('created_at', { ascending: false }),
      supabase.from('chat_history').select('user_id').in('user_id', chatUserIds),
      supabase.from('chat_history').select('user_id, content, created_at').in('user_id', chatUserIds).order('created_at', { ascending: false })
    ]);

    // Messenger counts
    const counts = {};
    (messengerCountRes.data || []).forEach(row => {
      counts[row.lead_id] = (counts[row.lead_id] || 0) + 1;
    });

    // Chat history counts (map user_id back to lead_id)
    const reverseMap = {};
    Object.entries(userIdMap).forEach(([leadId, userId]) => { reverseMap[userId] = leadId; });
    (chatCountRes.data || []).forEach(row => {
      const leadId = reverseMap[row.user_id] || row.user_id;
      counts[leadId] = (counts[leadId] || 0) + 1;
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
