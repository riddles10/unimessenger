import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { getAIResponse } from '../services/aiResponder.js';
import { sendViaBird } from '../services/bird.js';
import { runFunnelClassifier } from '../services/funnelClassifier.js';
import { io } from '../lib/socket.js';

const router = Router();

router.post('/webhook/bird', async (req, res) => {
  res.sendStatus(200); // Acknowledge Bird immediately

  try {
    // ── Log full payload for debugging ──────────────────────────
    console.log('[Webhook] Received Bird payload:', JSON.stringify(req.body, null, 2));

    // Bird webhook payloads can vary by event type.
    // Try multiple extraction strategies:
    const body = req.body;

    // Strategy 1: Direct top-level fields { contact, message, channel }
    // Strategy 2: Nested in body.data or body.payload
    // Strategy 3: Array of events
    const event = body.data || body.payload || body;

    const contact = event.contact || event.sender || event.from || {};
    const message = event.message || event.body || {};
    const channel = event.channel || {};

    // Extract message text — try multiple paths
    const messageText =
      message?.body?.text ||
      message?.text ||
      message?.content?.text ||
      message?.content ||
      event?.body?.text ||
      event?.text ||
      null;

    // Extract direction — try multiple paths
    const direction =
      message?.direction ||
      event?.direction ||
      event?.type ||
      body?.type ||
      null;

    console.log('[Webhook] Parsed:', {
      messageText,
      direction,
      contact: JSON.stringify(contact).substring(0, 200),
      channelId: channel?.id || channel?.channelId || 'none',
    });

    // Skip if no message text or outbound echo
    if (!messageText) {
      console.log('[Webhook] No message text found, skipping');
      return;
    }

    // Skip outbound messages (echoes)
    if (direction === 'outbound' || direction === 'sent') {
      console.log('[Webhook] Outbound message, skipping');
      return;
    }

    // Extract channel ID for platform resolution
    const channelId =
      channel?.id ||
      channel?.channelId ||
      event?.channelId ||
      body?.channelId ||
      null;

    const platform = resolvePlatform(channelId);

    // Extract phone number — try multiple paths
    const phoneNumber =
      contact?.identifierValue ||
      contact?.platformIdentifier ||
      contact?.phone ||
      contact?.msisdn ||
      event?.receiver?.contacts?.[0]?.identifierValue ||
      event?.from?.phone ||
      null;

    console.log('[Webhook] Phone:', phoneNumber, 'Platform:', platform);

    if (!phoneNumber) {
      console.log('[Webhook] No phone number found, skipping');
      return;
    }

    // Find lead by phone
    let { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', phoneNumber)
      .single();

    // If no lead exists, create one (organic inbound from non-registrant)
    if (!lead) {
      const displayName =
        contact?.displayName ||
        contact?.name ||
        contact?.firstName ||
        'Unknown';

      const { data: newLead, error: insertErr } = await supabase.from('leads').insert({
        phone: phoneNumber,
        name: displayName,
        preferred_channel: platform,
        bird_contact_id: contact?.id || null,
        bird_conversation_id: message?.conversationId || event?.conversationId || null,
        stage: 'new_lead'
      }).select().single();

      if (insertErr) {
        console.error('[Webhook] Failed to create lead:', insertErr);
        return;
      }
      lead = newLead;
      console.log('[Webhook] Created new lead:', lead.id);
    }

    // Log inbound message
    const { data: inboundMsg, error: msgErr } = await supabase.from('messenger_messages').insert({
      lead_id: lead.id,
      direction: 'inbound',
      text: messageText,
      platform,
      sent_by: 'user',
      bird_message_id: message?.id || event?.id || null
    }).select().single();

    if (msgErr) {
      console.error('[Webhook] Failed to log inbound message:', msgErr);
    }

    // Emit to inbox UI — shape matches frontend expectation
    io.emit('new_message', {
      leadId: lead.id,
      message: {
        id: inboundMsg?.id || `m_${Date.now()}`,
        text: messageText,
        senderType: 'user',
        platform,
        createdAt: inboundMsg?.created_at || new Date().toISOString(),
      }
    });

    console.log('[Webhook] Emitted new_message for lead:', lead.id);

    // If agent has taken over — do not auto-respond, just notify
    if (lead.mode === 'agent') {
      io.emit('agent_alert', { leadId: lead.id });
      console.log('[Webhook] Lead in agent mode, skipping AI response');
      return;
    }

    // AI responds using shared service
    const aiReply = await getAIResponse({
      userId: lead.pipsight_user_id ?? lead.id,
      newMessage: messageText,
      surface: 'messenger',
      platform
    });

    console.log('[Webhook] AI reply:', aiReply?.substring(0, 100));

    // Send reply via Bird
    const replyChannelId = platform === 'telegram'
      ? process.env.BIRD_TELEGRAM_CHANNEL_ID.trim()
      : process.env.BIRD_WHATSAPP_CHANNEL_ID.trim();

    await sendViaBird({ channelId: replyChannelId, phone: phoneNumber, text: aiReply });

    // Log outbound
    const { data: outboundMsg } = await supabase.from('messenger_messages').insert({
      lead_id: lead.id,
      direction: 'outbound',
      text: aiReply,
      platform,
      sent_by: 'ai'
    }).select().single();

    // Emit outbound to inbox UI
    io.emit('new_message', {
      leadId: lead.id,
      message: {
        id: outboundMsg?.id || `m_${Date.now()}`,
        text: aiReply,
        senderType: 'ai',
        platform,
        createdAt: outboundMsg?.created_at || new Date().toISOString(),
      }
    });

    // Run funnel classification in background (non-blocking)
    runFunnelClassifier(lead.id, messageText, aiReply).catch(console.error);

  } catch (err) {
    console.error('[Webhook] Error processing Bird event:', err);
  }
});

function resolvePlatform(channelId) {
  if (channelId === process.env.BIRD_WHATSAPP_CHANNEL_ID?.trim()) return 'whatsapp';
  if (channelId === process.env.BIRD_TELEGRAM_CHANNEL_ID?.trim()) return 'telegram';
  return 'unknown';
}

export default router;
