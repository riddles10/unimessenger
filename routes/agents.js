import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { sendViaBird } from '../services/bird.js';
import { io } from '../lib/socket.js';

const router = Router();

// Simple auth middleware — validates Supabase JWT from Authorization header
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing authorization token' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  req.user = user;
  next();
}

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

  await supabase.from('messenger_messages').insert({
    lead_id: req.params.leadId,
    direction: 'outbound',
    text,
    platform: lead.preferred_channel,
    sent_by: 'agent',
    agent_id: agentId
  });

  // Also persist to shared chat_history so AI has context if mode switches back
  await supabase.from('chat_history').insert({
    user_id: lead.pipsight_user_id ?? req.params.leadId,
    role: 'model',
    content: `[Agent]: ${text}`,
    surface: 'messenger',
    platform: lead.preferred_channel
  });

  io.emit('new_message', {
    leadId: req.params.leadId,
    message: text,
    direction: 'outbound',
    sentBy: 'agent',
    agentId,
    platform: lead.preferred_channel,
    timestamp: new Date()
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
  res.json(leads);
});

// Get messages for a lead
router.get('/leads/:leadId/messages', authenticate, async (req, res) => {
  const { data: messages, error } = await supabase
    .from('messenger_messages')
    .select('*')
    .eq('lead_id', req.params.leadId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(messages);
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
