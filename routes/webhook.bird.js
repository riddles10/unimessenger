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

    // ── Bird payload shape (confirmed from real webhook): ───────
    // { service: "channels", event: "whatsapp.inbound", payload: { ... } }
    // payload.sender.contact.identifierValue  → phone number
    // payload.body.text.text                  → message text (string)
    // payload.channelId                       → channel ID
    // payload.direction                       → "incoming" / "outgoing"
    const body = req.body;
    const payload = body.payload || body.data || body;

    // ── Extract message text ────────────────────────────────────
    // Bird nests text as: payload.body.text.text (string)
    const messageText =
      payload?.body?.text?.text ||       // Bird confirmed path
      payload?.body?.text ||             // fallback if text is flat string
      payload?.message?.text ||
      payload?.text ||
      null;

    // Ensure messageText is a string (not an object)
    const messageString = (typeof messageText === 'object' && messageText !== null)
      ? messageText.text || JSON.stringify(messageText)
      : messageText;

    // ── Extract direction ───────────────────────────────────────
    const direction =
      payload?.direction ||
      body?.direction ||
      null;

    // ── Extract channel ID ──────────────────────────────────────
    const channelId =
      payload?.channelId ||
      body?.channelId ||
      null;

    const platform = resolvePlatform(channelId);

    // ── Extract phone number ────────────────────────────────────
    // Bird nests phone as: payload.sender.contact.identifierValue
    const senderContact = payload?.sender?.contact || {};
    const phoneNumber =
      senderContact?.identifierValue ||      // Bird confirmed path
      senderContact?.platformIdentifier ||
      senderContact?.phone ||
      payload?.contact?.identifierValue ||   // fallback
      payload?.from?.phone ||
      null;

    // ── Extract Bird contact metadata ───────────────────────────
    const birdContactId = senderContact?.id || null;
    const displayName =
      senderContact?.annotations?.name ||
      senderContact?.displayName ||
      senderContact?.name ||
      'Unknown';

    console.log('[Webhook] Parsed:', {
      messageString,
      direction,
      phone: phoneNumber,
      channelId,
      platform,
      birdContactId,
    });

    // Skip if no message text
    if (!messageString) {
      console.log('[Webhook] No message text found, skipping');
      return;
    }

    // Skip outbound messages (echoes)
    if (direction === 'outgoing' || direction === 'outbound' || direction === 'sent') {
      console.log('[Webhook] Outbound message, skipping');
      return;
    }

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
      const { data: newLead, error: insertErr } = await supabase.from('leads').insert({
        phone: phoneNumber,
        name: displayName,
        preferred_channel: platform,
        bird_contact_id: birdContactId,
        bird_conversation_id: payload?.conversationId || null,
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
      text: messageString,
      platform,
      sent_by: 'user',
      bird_message_id: payload?.id || null
    }).select().single();

    if (msgErr) {
      console.error('[Webhook] Failed to log inbound message:', msgErr);
    }

    // Emit to inbox UI — shape matches frontend expectation
    io.emit('new_message', {
      leadId: lead.id,
      message: {
        id: inboundMsg?.id || `m_${Date.now()}`,
        text: messageString,
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
      newMessage: messageString,
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
    runFunnelClassifier(lead.id, messageString, aiReply).catch(console.error);

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
