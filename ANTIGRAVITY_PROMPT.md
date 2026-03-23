# Antigravity Prompt: Pipsight Inbox — Unified Messaging Dashboard

## Overview

Build a **3-column messaging inbox dashboard** for "Pipsight Inbox" — a unified messaging + CRM panel where support agents can view, manage, and respond to WhatsApp and Telegram conversations. This is a sub-product of an existing trading platform called **Pipsight**, so the design must match its existing dark cyberpunk/neon aesthetic exactly.

The frontend is a **single-page React app using Tailwind CSS**. It connects to an Express backend deployed at `https://unimessenger.onrender.com` and receives real-time updates via Socket.io.

---

## Design System (MUST match Pipsight)

### Theme: Dark Cyberpunk / Neon
```
Background:        #0B0E14 (page bg)
Panel Background:  #131722 (cards, sidebars)
Panel Hover:       #1e2433
Borders:           #2a2e39 (subtle, 1px solid)
```

### Accent Colors
```
Electric Blue:     #00e5ff  (primary CTA, links, focus rings, active states)
Neon Green:        #00ff88  (positive indicators — converted, online, bullish)
Vivid Red:         #ff3366  (alerts, agent mode, bearish)
Amber/Gold:        #f59e0b  (AI mode indicator)
```

### Typography
```
Font:              Inter (Google Fonts, weights 400–700)
Text Main:         #d1d4dc
Text Muted:        #8a91a4
Text White:        #ffffff (headings, high emphasis)
Antialiased rendering
```

### Component Tokens
```
Border Radius:     16px (panels), 8px (buttons, inputs, badges)
Transitions:       0.2s ease
Focus States:      electric-blue border + 0 0 0 2px rgba(0,229,255,0.25) box-shadow
Hover:             slight scale or opacity increase
Icons:             Phosphor Icons (ph ph-icon-name)
```

---

## Layout: 3-Column Inbox

```
┌──────────────────────────────────────────────────────────────────┐
│  Header Bar  (logo + "Pipsight Inbox" + agent name)    56px     │
├────────────┬─────────────────────────────┬───────────────────────┤
│            │                             │                       │
│  Sidebar   │      Chat View             │   Lead Panel          │
│  280px     │      flex-1                │   320px               │
│            │                             │                       │
│  Filter    │  Header: name + toggle     │  Contact Info         │
│  Pills     │                             │  Funnel Tracker       │
│            │  Message Thread            │  Intent Badge         │
│  Lead      │  (scrollable)              │  Engagement Stats     │
│  List      │                             │  Notes Textarea       │
│            │  Compose Bar               │                       │
│            │  (bottom-fixed)            │                       │
├────────────┴─────────────────────────────┴───────────────────────┤
```

---

## Column 1: Conversation Sidebar (280px)

### Filter Pills (top)
- Horizontal row of pills: `All` | `WhatsApp` | `Telegram` | `Agent Mode`
- Active pill: electric-blue bg with black text
- Inactive: transparent with muted text, subtle border
- "Agent Mode" filter shows only leads with `mode === 'agent'`

### Conversation List (scrollable)
Each conversation card:
```
┌──────────────────────────────────┐
│ 🟢 John Smith         2m ago    │
│ WA  qualified                    │
│ "Thanks, I'll check the demo…" │
└──────────────────────────────────┘
```

- **Name** (bold, text-white) + **time ago** (muted, right-aligned)
- **Channel badge**: green pill "WA" for WhatsApp, blue pill "TG" for Telegram
- **Stage pill**: color-coded (see below)
- **Last message**: truncated to 1 line, text-muted, 0.85rem
- **Red dot**: pulsing indicator when `shouldAlertAgent = true`
- **Selected state**: `bg-[#1e2433]` with left blue border (2px electric-blue)
- **Hover**: `bg-[#1a1f2e]`

### Stage Colors
| Stage | Background | Text |
|-------|-----------|------|
| new_lead | rgba(0,229,255,0.1) | #00e5ff |
| qualified | rgba(168,85,247,0.1) | #a855f7 |
| demo_sent | rgba(234,179,8,0.1) | #eab308 |
| negotiating | rgba(249,115,22,0.1) | #f97316 |
| converted | rgba(0,255,136,0.1) | #00ff88 |

---

## Column 2: Chat View (flex-1)

### Chat Header (fixed top of column)
- Left: Lead name (text-white, font-semibold) + phone number (text-muted)
- Right: **AI/Agent Mode Toggle** (see component below)
- Bottom border: 1px solid #2a2e39

### Message Thread (scrollable, auto-scroll to bottom)

**Message Bubbles:**

| Type | Alignment | Background | Label |
|------|-----------|-----------|-------|
| Inbound (user) | Left | #1e2433 | "User" in muted text |
| AI outbound | Left | rgba(245,158,11,0.08) with 1px amber border | "AI" in amber |
| Agent outbound | Left | rgba(255,51,102,0.08) with 1px red border | "Agent" in red |

Each bubble shows:
- **Platform badge** (tiny WA/TG icon, top-right of bubble)
- **Sender label** (User / AI / Agent)
- **Message text** (text-main, 0.95rem)
- **Timestamp** (HH:MM, bottom-right, text-muted, 0.75rem)

Bubbles: max-width 75%, border-radius 12px, padding 12px 16px.

### Compose Bar (fixed bottom of column)

- **AI mode**: input disabled, muted placeholder "Switch to Agent mode to reply", subtle tooltip
- **Agent mode**: pill-shaped input (border-radius 28px), dark bg, electric-blue focus glow
- **Send button**: circular (40px), gradient `linear-gradient(135deg, #00e5ff, #00bfff)`, black paper-plane icon (Phosphor: `ph-paper-plane-right`)
- Send on Enter key or click

---

## Column 3: Lead Panel (320px)

### Contact Info (top section)
- Large channel icon (WhatsApp green or Telegram blue)
- Lead name (text-white, 1.1rem, font-semibold)
- Phone number (text-muted)
- Email if available (text-muted)

### Funnel Progress Tracker
Visual 5-step horizontal tracker:
```
[new_lead] → [qualified] → [demo_sent] → [negotiating] → [converted]
```
- Each step: circle (24px) + label below
- Completed steps: filled with stage color
- Current step: filled + glowing ring (box-shadow)
- Future steps: hollow circle with border-color #2a2e39
- Connecting lines between circles (2px, filled = stage color, unfilled = border-color)

### Intent Badge
- Display current intent: `browsing` | `interested` | `objecting` | `ready_to_buy`
- Styled as a badge with appropriate color:
  - browsing: muted/gray
  - interested: electric-blue
  - objecting: amber
  - ready_to_buy: neon-green

### Engagement Stats (2×2 grid)
```
┌─────────────┬─────────────┐
│  Messages   │  Days in    │
│     24      │  Funnel: 3  │
├─────────────┼─────────────┤
│ Lead Score  │    Mode     │
│    72/100   │   🤖 AI     │
└─────────────┴─────────────┘
```
Each stat: panel-bg card, rounded-8px, centered, value in text-white font-semibold, label in text-muted 0.75rem.

### Notes Textarea
- Dark input (bg-dark), rounded-8px
- Placeholder: "Add notes about this lead…"
- Auto-saves on blur (PATCH endpoint)
- Electric-blue focus border

---

## AI/Agent Mode Toggle Component

```
┌────────────────────────┐
│  AI  ═══●═══  Agent   │
└────────────────────────┘
```

- Sliding toggle between AI (amber/gold) and Agent (vivid red)
- Track: 48px wide, rounded-full
- Knob: 20px circle, white, slides left↔right
- AI selected: track is amber, "AI" label bold
- Agent selected: track is vivid-red, "Agent" label bold
- Smooth 0.2s slide transition

---

## API Endpoints (Backend at `https://unimessenger.onrender.com`)

All agent endpoints require `Authorization: Bearer <supabase-jwt>` header.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/leads` | Fetch all leads (sorted by updated_at desc) |
| GET | `/api/leads/:leadId/messages` | Fetch messages for a lead |
| POST | `/api/leads/:leadId/mode` | Toggle mode `{ mode: 'ai'\|'agent' }` |
| POST | `/api/leads/:leadId/messages` | Agent sends message `{ text }` |
| PATCH | `/api/leads/:leadId` | Update `{ notes }` or `{ stage }` |
| GET | `/health` | Health check |

---

## Socket.io Events (Real-time)

Connect to `https://unimessenger.onrender.com` with Socket.io client.

| Event | Payload | Action |
|-------|---------|--------|
| `new_message` | `{ leadId, message }` | Append to thread if viewing, bump lead to top, update lastMessage |
| `funnel_update` | `{ leadId, stage, intent }` | Update stage/intent in sidebar + lead panel |
| `agent_alert` | `{ leadId }` | Show pulsing red dot on lead in sidebar |
| `mode_changed` | `{ leadId, mode, assignedAgentId }` | Update toggle state + lead mode display |

---

## Empty States

- **No leads**: center illustration + "No conversations yet. Leads will appear here when users message via WhatsApp or Telegram."
- **No lead selected**: center of chat view shows Pipsight logo (muted) + "Select a conversation to start"
- **No messages**: "Start of conversation" divider

---

## Responsive Behavior

- **Desktop (>1024px)**: Full 3-column layout
- **Tablet (768–1024px)**: Sidebar collapses to icons-only (60px), lead panel hidden (togglable)
- **Mobile (<768px)**: Single column with bottom nav tabs (Chats / Chat / Lead), full-screen views

---

## Tech Stack

- **React 18** with hooks (useState, useEffect, useRef, useCallback)
- **Tailwind CSS** with custom theme extending the color tokens above
- **Socket.io Client** for real-time
- **Phosphor Icons** (`@phosphor-icons/react`)
- **Fetch API** for REST calls
- No state management library needed — local component state is sufficient

---

## File Structure
```
src/
├── App.jsx
├── index.css                  (Tailwind imports + custom overrides)
├── pages/
│   └── inbox/
│       ├── InboxPage.jsx      (root layout, state management, socket)
│       ├── ConversationList.jsx
│       ├── ChatView.jsx
│       ├── LeadPanel.jsx
│       └── AgentModeToggle.jsx
├── components/
│   ├── Badge.jsx              (reusable channel/stage/intent badge)
│   └── FunnelTracker.jsx      (5-step progress visualization)
└── utils/
    ├── api.js                 (fetch helpers with auth header)
    ├── socket.js              (socket.io singleton)
    └── constants.js           (stage colors, channel config)
```

---

## Critical Requirements

1. **Dark theme only** — no light mode
2. **Must match Pipsight's existing aesthetic** — same colors, fonts, border-radius, glow effects
3. **Real-time updates** are essential — the inbox must feel alive with socket events
4. **Agent mode disables AI** — when toggled to Agent, only manual messages are sent
5. **Platform badges on every message** — users must always see which channel (WA/TG)
6. **Red pulsing dot** for agent alerts — critical for timely intervention
7. **Auto-scroll** chat to latest message
8. **Funnel never regresses** — the tracker only moves forward visually
