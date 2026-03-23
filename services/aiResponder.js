import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../lib/supabase.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());

// Base system prompt — shared with Pipsight app
const PIPSIGHT_SYSTEM_PROMPT = `You are Pipsight AI, a knowledgeable and friendly trading assistant for the Pipsight platform. You help users with forex, equities, and crypto trading questions. Be concise, accurate, and supportive. When unsure, be honest about it.`;

const MESSENGER_ADDENDUM = `
When responding via WhatsApp or Telegram:
- Plain text only. No markdown, no asterisks, no headers.
- Keep responses under 3 sentences unless the user asks a detailed question.
- If the user needs complex help, invite them to open the Pipsight app.
`;

export async function getAIResponse({ userId, newMessage, surface = 'app', platform = null }) {
  // Fetch last 40 messages from shared chat_history (covers both app and messenger)
  const { data: historyRows } = await supabase
    .from('chat_history')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(40);

  const history = (historyRows || []).map(row => ({
    role: row.role,
    parts: [{ text: row.content }]
  }));

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    systemInstruction: PIPSIGHT_SYSTEM_PROMPT +
      (surface === 'messenger' ? MESSENGER_ADDENDUM : '')
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(newMessage);
  const responseText = result.response.text();

  // Persist both turns to shared chat_history
  await supabase.from('chat_history').insert([
    { user_id: userId, role: 'user', content: newMessage, surface, platform },
    { user_id: userId, role: 'model', content: responseText, surface, platform }
  ]);

  return responseText;
}
