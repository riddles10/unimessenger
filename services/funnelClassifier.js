import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../lib/supabase.js';
import { io } from '../lib/socket.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());

const STAGE_ORDER = ['new_lead', 'qualified', 'demo_sent', 'negotiating', 'converted'];

export async function runFunnelClassifier(leadId, userMsg, aiReply) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const result = await model.generateContent(`
You are a sales funnel classifier for a brokerage platform.
Analyse this single conversation turn and return ONLY a JSON object.

User said: "${userMsg}"
AI replied: "${aiReply}"

Return:
{
  "stage": "new_lead" | "qualified" | "demo_sent" | "negotiating" | "converted",
  "intent": "browsing" | "interested" | "objecting" | "ready_to_buy",
  "shouldAlertAgent": true | false,
  "reason": "one sentence"
}

Rules:
- Only advance stage, never go backwards
- shouldAlertAgent = true when user shows strong buying intent or raises a pricing objection that needs a human
- Return ONLY the JSON object, no other text
  `);

  let classification;
  try {
    const text = result.response.text().replace(/```json\n?|\n?```/g, '').trim();
    classification = JSON.parse(text);
  } catch {
    return; // malformed response — skip silently
  }

  // Fetch current lead to compare stages
  const { data: lead } = await supabase
    .from('leads')
    .select('stage')
    .eq('id', leadId)
    .single();

  if (!lead) return;

  const currentIdx = STAGE_ORDER.indexOf(lead.stage);
  const newIdx = STAGE_ORDER.indexOf(classification.stage);

  const updates = { intent: classification.intent, updated_at: new Date().toISOString() };

  // Only advance, never regress
  if (newIdx > currentIdx) {
    updates.stage = classification.stage;

    await supabase.from('funnel_events').insert({
      lead_id: leadId,
      from_stage: lead.stage,
      to_stage: classification.stage,
      triggered_by: 'classifier',
      reason: classification.reason
    });
  }

  await supabase.from('leads').update(updates).eq('id', leadId);

  // Real-time update to inbox
  io.emit('funnel_update', { leadId, ...updates });

  // Alert agents if needed
  if (classification.shouldAlertAgent) {
    io.emit('agent_alert', {
      leadId,
      reason: classification.reason,
      intent: classification.intent
    });
  }
}
