# Pipsight Messenger Platform — Build Spec
> For Claude Code: This document describes a new service to build alongside the existing Pipsight codebase. You already have context on Pipsight's architecture, Gemini API integration, and Supabase schema. Build this as a companion service that shares the AI layer and `chat_history` table.

---

## 1. What We're Building

A unified outbound messaging + CRM platform ("Pipsight Inbox") that:

1. Sends automated welcome messages to new Pipsight registrants via WhatsApp or Telegram (their choice)
2. Carries on AI-powered conversations with leads using the **same Gemini model and system prompt already inside Pipsight** — unified memory via the existing `chat_history` Supabase table
3. Tracks each lead's movement through a 5-stage sales funnel using Gemini Flash intent classification
4. Lets human agents see all conversations in one inbox, intervene live (Agent Mode), and hand back to AI
5. Shows which platform (WhatsApp vs Telegram) each message arrived on, always

All of this is powered by a single third-party API: **Bird (formerly MessageBird)** — one unified Conversations API for both WA and Telegram.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        BIRD API LAYER                        │
│         WhatsApp Channel ──┐    Telegram Channel ──┐        │
│                            ▼                        ▼        │
│                    Bird Conversations API                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ Webhooks (inbound) / REST (outbound)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND (new service)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Webhook     │  │  AI Responder│  │  Funnel          │  │
│  │  Receiver    │→ │  (shared     │→ │  Classifier      │  │
│  │  /webhook/   │  │  w/ Pipsight)│  │  (Gemini Flash)  │  │
│  │  bird        │  └──────────────┘  └──────────────────┘  │
│  └──────────────┘                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Agent Mode  │  │  Message     │  │  Registration    │  │
│  │  Controller  │  │  Queue       │  │  Hook            │  │
│  │              │  │  (BullMQ)    │  │  (post-signup)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebSocket (Socket.io, real-time)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   FRONTEND (Pipsight Inbox UI)               │
│  Conversation List │ Chat View │ Funnel Panel │ Agent Toggle │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Messaging API | Bird (MessageBird) Conversations API |
| AI | Gemini 1.5 Pro (same model as Pipsight chat) |
| Intent classification | Gemini 1.5 Flash (cheap, fast) |
| Database | Supabase (shared with Pipsight) |
| Queue | BullMQ + Redis |
| Real-time | Socket.io |
| Backend | Node.js / Express (match existing Pipsight stack) |
| Frontend | React + Tailwind CSS (match existing Pipsight stack) |

---

## 4. Environment Variables to Add

```env
# Bird API
BIRD_ACCESS_KEY=
BIRD_WORKSPACE_ID=
BIRD_WHATSAPP_CHANNEL_ID=
BIRD_TELEGRAM_CHANNEL_ID=

# Redis (for BullMQ)
REDIS_URL=redis://localhost:6379

# Gemini — already exists in Pipsight, reuse same key
GEMINI_API_KEY=  # already set
```

---

## 5. Supabase Schema Changes

Run these migrations on the existing Pipsight Supabase project.

```sql
-- Extend existing chat_history table
ALTER TABLE chat_history
  ADD COLUMN IF NOT EXISTS surface TEXT DEFAULT 'app',   -- 'app' | 'messenger'
  ADD COLUMN IF NOT EXISTS platform TEXT;                -- 'whatsapp' | 'telegram' | null

-- New: leads table (contacts who registered or messaged in)
CREATE TABLE IF NOT EXISTS leads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipsight_user_id      UUID REFERENCES auth.users(id),  -- null if not yet registered
  name                  TEXT,
  phone                 TEXT,                             -- E.164 format: +66812345678
  email                 TEXT,
  stage                 TEXT DEFAULT 'new_lead',          -- see funnel stages below
  intent                TEXT,                             -- browsing | interested | objecting | ready_to_buy
  lead_score            INT DEFAULT 0,
  mode                  TEXT DEFAULT 'ai',                -- 'ai' | 'agent'
  assigned_agent_id     UUID REFERENCES auth.users(id),
  bird_contact_id       TEXT,
  bird_conversation_id  TEXT,
  preferred_channel     TEXT,                             -- 'whatsapp' | 'telegram'
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- New: messages table (all inbound + outbound messenger messages)
CREATE TABLE IF NOT EXISTS messenger_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID REFERENCES leads(id),
  direction         TEXT,        -- 'inbound' | 'outbound'
  text              TEXT,
  platform          TEXT,        -- 'whatsapp' | 'telegram'
  sent_by           TEXT,        -- 'ai' | 'agent' | 'user'
  agent_id          UUID REFERENCES auth.users(id),
  bird_message_id   TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- New: funnel events log
CREATE TABLE IF NOT EXISTS funnel_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID REFERENCES leads(id),
  from_stage    TEXT,
  to_stage      TEXT,
  triggered_by  TEXT,  -- 'classifier' | 'agent' | 'system'
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_pipsight_user ON leads(pipsight_user_id);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_lead ON messenger_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);
```

**Funnel stages (in order):**
`new_lead` → `qualified` → `demo_sent` → `negotiating` → `converted`

---

## 6. Shared AI Service

> CRITICAL: This must reuse the same Gemini model and system prompt already in Pipsight. Do not create a second AI integration. Export `getAIResponse` from a shared module that both the existing Pipsight chat route and the new messenger webhook can import.

```js
// services/aiResponder.js

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../lib/supabase.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// REUSE the existing Pipsight system prompt — import it from wherever it currently lives
// Then append the messenger-specific instruction based on surface
const MESSENGER_ADDENDUM = `
When responding via WhatsApp or Telegram:
- Plain text only. No markdown, no asterisks, no headers.
- Keep responses under 3 sentences unless the user asks a detailed question.
- If the user needs complex help, invite them to open the Pipsight app.
`;

export async function getAIResponse({ userId, newMessage, surface = 'app', platform = null }) {
  // Fetch last 40 messages from shared chat_history (covers both app and messenger history)
  const { data: historyRows } = await supabase
    .from('chat_history')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(40);

  const history = (historyRows || []).map(row => ({
    role: row.role,           // 'user' | 'model'
    parts: [{ text: row.content }]
  }));

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    systemInstruction: PIPSIGHT_SYSTEM_PROMPT +  // import from existing location
      (surface === 'messenger' ? MESSENGER_ADDENDUM : '')
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(newMessage);
  const responseText = result.response.text();

  // Persist both turns to shared chat_history
  await supabase.from('chat_history').insert([
    { user_id: userId, role: 'user',  content: newMessage,   surface, platform },
    { user_id: userId, role: 'model', content: responseText, surface, platform },
  ]);

  return responseText;
}
```

---

## 7. Registration Hook — Send Welcome Message

Immediately after a user registers on Pipsight, add a job to the queue to send a welcome message.

```js
// In existing registration handler — add this after user creation:

import { welcomeQueue } from '../queues/welcome.js';

await welcomeQueue.add('send-welcome', {
  userId: newUser.id,
  name: newUser.name,
  phone: newUser.phone,               // E.164 format
  preferredChannel: req.body.preferredChannel  // 'whatsapp' | 'telegram' — collected at signup
});
```

**Queue worker:**

```js
// queues/welcome.js

import { Queue, Worker } from 'bullmq';
import { sendViaBird } from '../services/bird.js';
import { getAIResponse } from '../services/aiResponder.js';
import { supabase } from '../lib/supabase.js';

export const welcomeQueue = new Queue('welcome-messages', { connection: { url: process.env.REDIS_URL } });

new Worker('welcome-messages', async (job) => {
  const { userId, name, phone, preferredChannel } = job.data;

  // Create lead record
  const { data: lead } = await supabase.from('leads').insert({
    pipsight_user_id: userId,
    name, phone,
    preferred_channel: preferredChannel,
    stage: 'new_lead'
  }).select().single();

  // Generate personalised welcome via AI (seeds the conversation)
  const welcomeText = await getAIResponse({
    userId,
    newMessage: `[SYSTEM: User ${name} just registered on Pipsight. Send a warm, brief welcome message and ask one qualifying question about their trading background.]`,
    surface: 'messenger',
    platform: preferredChannel
  });

  // Send via Bird on the correct channel
  const channelId = preferredChannel === 'telegram'
    ? process.env.BIRD_TELEGRAM_CHANNEL_ID
    : process.env.BIRD_WHATSAPP_CHANNEL_ID;

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

}, { connection: { url: process.env.REDIS_URL } });
```

---

## 8. Bird Webhook Handler (Inbound Messages)

```js
// routes/webhook.bird.js

import express from 'express';
import { supabase } from '../lib/supabase.js';
import { getAIResponse } from '../services/aiResponder.js';
import { sendViaBird } from '../services/bird.js';
import { runFunnelClassifier } from '../services/funnelClassifier.js';
import { io } from '../lib/socket.js';

const router = express.Router();

router.post('/webhook/bird', async (req, res) => {
  res.sendStatus(200); // Acknowledge Bird immediately

  const { contact, message, channel } = req.body;
  if (message.direction !== 'received') return; // ignore our own outbound echoes

  const platform = resolvePlatform(channel.id); // maps channelId → 'whatsapp' | 'telegram'
  const phoneNumber = contact.identifierValue;

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
  await supabase.from('messenger_messages').insert({
    lead_id: lead.id,
    direction: 'inbound',
    text: message.body.text,
    platform,
    sent_by: 'user',
    bird_message_id: message.id
  });

  // Emit to inbox UI in real-time
  io.emit('new_message', {
    leadId: lead.id,
    message: message.body.text,
    direction: 'inbound',
    platform,
    timestamp: new Date()
  });

  // If agent has taken over — do not auto-respond, just notify
  if (lead.mode === 'agent') {
    io.emit('agent_message_received', { leadId: lead.id, message: message.body.text });
    return;
  }

  // AI responds using shared service
  const aiReply = await getAIResponse({
    userId: lead.pipsight_user_id ?? lead.id, // fallback to lead ID if not a registered user
    newMessage: message.body.text,
    surface: 'messenger',
    platform
  });

  // Send reply via Bird
  const channelId = platform === 'telegram'
    ? process.env.BIRD_TELEGRAM_CHANNEL_ID
    : process.env.BIRD_WHATSAPP_CHANNEL_ID;

  await sendViaBird({ channelId, phone: phoneNumber, text: aiReply });

  // Log outbound
  await supabase.from('messenger_messages').insert({
    lead_id: lead.id,
    direction: 'outbound',
    text: aiReply,
    platform,
    sent_by: 'ai'
  });

  // Emit outbound to inbox UI
  io.emit('new_message', {
    leadId: lead.id,
    message: aiReply,
    direction: 'outbound',
    platform,
    sentBy: 'ai',
    timestamp: new Date()
  });

  // Run funnel classification in background (don't await — non-blocking)
  runFunnelClassifier(lead.id, message.body.text, aiReply).catch(console.error);
});

function resolvePlatform(channelId) {
  if (channelId === process.env.BIRD_WHATSAPP_CHANNEL_ID) return 'whatsapp';
  if (channelId === process.env.BIRD_TELEGRAM_CHANNEL_ID) return 'telegram';
  return 'unknown';
}

export default router;
```

---

## 9. Bird API Client

```js
// services/bird.js

const BIRD_BASE = 'https://api.bird.com';

export async function sendViaBird({ channelId, phone, text }) {
  const res = await fetch(
    `${BIRD_BASE}/workspaces/${process.env.BIRD_WORKSPACE_ID}/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `AccessKey ${process.env.BIRD_ACCESS_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receiver: {
          contacts: [{ identifierKey: 'phonenumber', identifierValue: phone }]
        },
        body: {
          type: 'text',
          text: { text }
        }
      })
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Bird API error: ${JSON.stringify(err)}`);
  }

  return res.json();
}
```

---

## 10. Funnel Classifier (Gemini Flash)

Auto-advances funnel stage and alerts agents when a lead is ready to be closed manually.

```js
// services/funnelClassifier.js

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../lib/supabase.js';
import { io } from '../lib/socket.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
    classification = JSON.parse(result.response.text());
  } catch {
    return; // malformed response — skip silently
  }

  // Fetch current lead to compare stages
  const { data: lead } = await supabase.from('leads').select('stage').eq('id', leadId).single();
  const currentIdx = STAGE_ORDER.indexOf(lead.stage);
  const newIdx = STAGE_ORDER.indexOf(classification.stage);

  const updates = { intent: classification.intent };

  // Only advance, never regress
  if (newIdx > currentIdx) {
    updates.stage = classification.stage;

    // Log the transition
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
```

---

## 11. Agent Mode Controller

```js
// routes/agents.js

router.post('/leads/:leadId/mode', authenticate, async (req, res) => {
  const { mode } = req.body; // 'ai' | 'agent'
  const agentId = req.user.id;

  await supabase.from('leads').update({
    mode,
    assigned_agent_id: mode === 'agent' ? agentId : null
  }).eq('id', req.params.leadId);

  io.emit('mode_changed', { leadId: req.params.leadId, mode, agentId });
  res.json({ ok: true });
});

// Agent sends a message manually
router.post('/leads/:leadId/messages', authenticate, async (req, res) => {
  const { text } = req.body;
  const agentId = req.user.id;

  const { data: lead } = await supabase
    .from('leads')
    .select('phone, preferred_channel, mode')
    .eq('id', req.params.leadId)
    .single();

  if (lead.mode !== 'agent') {
    return res.status(403).json({ error: 'Lead is in AI mode. Switch to agent mode first.' });
  }

  const channelId = lead.preferred_channel === 'telegram'
    ? process.env.BIRD_TELEGRAM_CHANNEL_ID
    : process.env.BIRD_WHATSAPP_CHANNEL_ID;

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
    user_id: req.params.leadId, // use lead ID if no pipsight_user_id
    role: 'model',
    content: `[Agent ${agentId}]: ${text}`,
    surface: 'messenger',
    platform: lead.preferred_channel
  });

  io.emit('new_message', {
    leadId: req.params.leadId,
    message: text,
    direction: 'outbound',
    sentBy: 'agent',
    agentId,
    timestamp: new Date()
  });

  res.json({ ok: true });
});
```

---

## 12. Frontend — Pipsight Inbox UI

Build as a new route inside the existing Pipsight React app: `/inbox`

### Components to build:

```
/inbox
├── InboxPage.jsx              — root layout
├── ConversationList.jsx       — left sidebar, all leads sorted by last activity
├── ChatView.jsx               — centre column, message thread
├── LeadPanel.jsx              — right panel, lead profile + funnel + stats
└── AgentModeToggle.jsx        — AI / Agent switch in chat header
```

### Key UI requirements:

**ConversationList:**
- Each row shows: name, channel badge (WA in green / TG in blue), funnel stage pill, last message preview, timestamp
- Filter pills: All / WhatsApp / Telegram / Agent Live
- Red dot indicator on leads with `shouldAlertAgent = true`
- Real-time updates via Socket.io (`new_message`, `funnel_update`, `agent_alert`)

**ChatView:**
- Messages grouped by sender: user / AI / agent (AI messages have amber accent, agent messages have red accent)
- Every message shows a platform badge (WA/TG) — never hidden
- System messages for mode switches: "Agent mode activated by Sam K."
- Compose bar disabled in AI mode with tooltip: "Switch to Agent mode to type manually"

**AgentModeToggle:**
- Two-state toggle: AI (default, amber) / Agent (active, red)
- Switching to Agent POSTs to `/leads/:leadId/mode`
- If another agent is already assigned, show "Handled by [name]" and disable toggle

**LeadPanel:**
- Name, phone, email, platform indicator
- Funnel progress tracker (5 steps, colour-coded, current step highlighted)
- Engagement stats: total messages, days in funnel, avg reply time, lead score
- Notes textarea (persists to `leads.notes`)

### Socket.io events to handle:

```js
socket.on('new_message',      ({ leadId, message, direction, platform, sentBy }) => { ... })
socket.on('funnel_update',    ({ leadId, stage, intent }) => { ... })
socket.on('agent_alert',      ({ leadId, reason }) => { ... })  // show toast + red dot
socket.on('mode_changed',     ({ leadId, mode, agentId }) => { ... })
```

---

## 13. Telegram-Specific Consideration

Telegram's Bot API **cannot cold-message users**. A user must initiate contact with your bot first.

**Workaround — required:**

On the Pipsight registration success screen, if the user selected Telegram, show:

```
"Click to connect on Telegram: https://t.me/YourPipsightBot?start={userId}"
```

When they click Start in Telegram, your bot receives the event. Store their `chat_id`:

```js
// In your Telegram bot setup (handled by Bird's webhook, but if you run a raw bot):
bot.onText(/\/start (.+)/, async (msg, match) => {
  const userId = match[1];
  const chatId = msg.chat.id;
  await supabase.from('leads')
    .update({ bird_contact_id: String(chatId) })
    .eq('pipsight_user_id', userId);
});
```

Bird handles this automatically once the channel is configured — the webhook will fire with the contact's details on first `/start`.

For WhatsApp: no such restriction — you can initiate with a pre-approved template message.

---

## 14. WhatsApp Template Message for Welcome

WhatsApp requires pre-approved templates for business-initiated messages. Submit this template in Meta Business Manager under the Bird account:

**Template name:** `pipsight_welcome`
**Category:** Marketing
**Body:**
```
Hi {{1}}, welcome to Pipsight! 🎯

I'm your AI trading assistant. To get started, can you tell me — are you primarily trading forex, equities, or crypto?
```

Use `{{1}}` = user's first name. Approval typically takes 1–2 business days.

---

## 15. File Structure (new files to create)

```
/services
  aiResponder.js          — shared Gemini service (modify existing or extract)
  bird.js                 — Bird API client
  funnelClassifier.js     — Gemini Flash intent classification

/queues
  welcome.js              — BullMQ queue + worker for post-registration messages

/routes
  webhook.bird.js         — Bird inbound webhook handler
  agents.js               — Agent mode + manual message endpoints

/lib
  socket.js               — Socket.io instance (export for use across routes)

/migrations
  001_messenger_platform.sql  — Supabase schema additions (section 5 above)

/frontend/src/pages
  inbox/
    InboxPage.jsx
    ConversationList.jsx
    ChatView.jsx
    LeadPanel.jsx
    AgentModeToggle.jsx
```

---

## 16. Build Order (recommended)

1. Run Supabase migration (section 5)
2. Add env vars (section 4)
3. Create `services/bird.js` and test with a manual API call
4. Extract/create `services/aiResponder.js` — verify it shares chat_history with Pipsight chat
5. Create `queues/welcome.js` + connect to registration handler
6. Create `routes/webhook.bird.js` + configure Bird webhook URL in dashboard
7. Create `services/funnelClassifier.js`
8. Create `routes/agents.js`
9. Set up Socket.io in `lib/socket.js`, wire events
10. Build frontend Inbox UI (section 12)

---

## 17. Notes for Claude Code

- **Do not create a second Gemini client.** Import `getAIResponse` from the shared service. The system prompt lives in one place.
- **`chat_history` is the single source of truth** for all conversation context — app, WhatsApp, and Telegram all write to it. The AI always sees the full history regardless of surface.
- **`surface` column** distinguishes where each message came from — useful for analytics but not for routing.
- **`platform` column** on `chat_history` and `messenger_messages` is always populated for messenger turns — this is what the inbox UI uses to show the WA/TG badge.
- **BullMQ requires Redis** — ensure Redis is running locally or add a managed Redis URL (Upstash works well with Supabase projects).
- **Bird webhook must be publicly accessible** during development — use ngrok or a deployed URL. Configure the webhook URL in the Bird Dashboard under Conversations → Webhooks.
- **Multi-tenant future:** If this platform is later sold as SaaS, add a `workspace_id` column to `leads`, `messenger_messages`, and `funnel_events`, and gate Bird credentials per workspace. Design with this in mind but don't implement it now.
