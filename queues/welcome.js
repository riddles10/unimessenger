import { Queue, Worker } from 'bullmq';
import { sendViaBird } from '../services/bird.js';
import { getAIResponse } from '../services/aiResponder.js';
import { supabase } from '../lib/supabase.js';
import { createRedisConnection } from '../lib/redis.js';

const connection = createRedisConnection();

export const welcomeQueue = new Queue('welcome-messages', { connection });

export function startWelcomeWorker() {
  const worker = new Worker('welcome-messages', async (job) => {
    const { userId, name, phone, preferredChannel } = job.data;

    // Create lead record
    const { data: lead, error: leadErr } = await supabase.from('leads').insert({
      pipsight_user_id: userId,
      name,
      phone,
      preferred_channel: preferredChannel,
      stage: 'new_lead'
    }).select().single();

    if (leadErr) {
      console.error('[Welcome] Failed to create lead:', leadErr);
      throw leadErr;
    }

    // Generate personalised welcome via AI (seeds the conversation)
    const welcomeText = await getAIResponse({
      userId,
      newMessage: `[SYSTEM: User ${name} just registered on Pipsight. Send a warm, brief welcome message and ask one qualifying question about their trading background.]`,
      surface: 'messenger',
      platform: preferredChannel
    });

    // Send via Bird on the correct channel
    const channelId = preferredChannel === 'telegram'
      ? process.env.BIRD_TELEGRAM_CHANNEL_ID.trim()
      : process.env.BIRD_WHATSAPP_CHANNEL_ID.trim();

    const birdResponse = await sendViaBird({ channelId, phone, text: welcomeText });

    // Store outbound message
    await supabase.from('messenger_messages').insert({
      lead_id: lead.id,
      direction: 'outbound',
      text: welcomeText,
      platform: preferredChannel,
      sent_by: 'ai',
      bird_message_id: birdResponse.id
    });

    console.log(`[Welcome] Sent welcome to ${name} via ${preferredChannel}`);
  }, { connection });

  worker.on('failed', (job, err) => {
    console.error(`[Welcome] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
