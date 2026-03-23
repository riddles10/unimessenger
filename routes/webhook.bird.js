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
    const { contact, message, channel } = req.body;
    if (!message || message.direction !== 'received') return;

    const platform = resolvePlatform(channel?.id);
    const phoneNumber = contact?.identifierValue;

    if (!phoneNumber) return;

    // Find lead by phone
    let { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', phoneNumber)
      .single();

    // If no lead exists, create one (organic inbound from non-registrant)
    if (!lead) {
      const { data: newLead } = await supabase.from('leads').insert({
        phone: phoneNumber,
        name: contact.displayName || 'Unknown',
        preferred_channel: platform,
        bird_contact_id: contact.id,
        bird_conversation_id: message.conversationId,
        stage: 'new_lead'
      }).select().single();
      lead = newLead;
    }

    // Log inbound message
    const { data: inboundMsg } = await supabase.from('messenger_messages').insert({
      lead_id: lead.id,
      direction: 'inbound',
      text: message.body.text,
      platform,
      sent_by: 'user',
      bird_message_id: message.id
    }).select().single();

    // Emit to inbox UI — shape matches frontend expectation
    io.emit('new_message', {
      leadId: lead.id,
      message: {
        id: inboundMsg?.id || `m_${Date.now()}`,
        text: message.body.text,
        senderType: 'user',
        platform,
        createdAt: inboundMsg?.created_at || new Date().toISOString(),
      }
    });

    // If agent has taken over — do not auto-respond, just notify
    if (lead.mode === 'agent') {
      io.emit('agent_alert', { leadId: lead.id });
      return;
    }

    // AI responds using shared service
    const aiReply = await getAIResponse({
      userId: lead.pipsight_user_id ?? lead.id,
      newMessage: message.body.text,
      surface: 'messenger',
      platform
    });

    // Send reply via Bird
    const channelId = platform === 'telegram'
      ? process.env.BIRD_TELEGRAM_CHANNEL_ID.trim()
      : process.env.BIRD_WHATSAPP_CHANNEL_ID.trim();

    await sendViaBird({ channelId, phone: phoneNumber, text: aiReply });

    // Log outbound
    const { data: outboundMsg } = await supabase.from('messenger_messages').insert({
      lead_id: lead.id,
      direction: 'outbound',
      text: aiReply,
      platform,
      sent_by: 'ai'
    }).select().single();

    // Emit outbound to inbox UI — shape matches frontend
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
    runFunnelClassifier(lead.id, message.body.text, aiReply).catch(console.error);

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
