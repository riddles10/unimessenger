-- ============================================================
-- Pipsight Messenger — Supabase Schema Migration
-- Run this on the existing Pipsight Supabase project.
-- ============================================================

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
  stage                 TEXT DEFAULT 'new_lead',          -- new_lead | qualified | demo_sent | negotiating | converted
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
