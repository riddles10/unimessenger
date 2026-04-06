-- ============================================================
-- Pipsight Messenger — Add unread message tracking
-- Run on the existing Pipsight Supabase project after 001.
-- ============================================================

-- Per-lead read receipt. A message is "unread" if its created_at is
-- newer than the lead's last_read_at. The frontend writes this column
-- via POST /api/leads/:leadId/read whenever an agent opens or focuses
-- a conversation. Tracked at the lead level (not per-agent) to match
-- the existing single-assignee model used by leads.assigned_agent_id.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

-- Backfill: treat existing leads as fully read at migration time so
-- the day-of-rollout doesn't suddenly mark every old conversation as
-- unread. New leads created after this migration will have NULL
-- last_read_at until the first inbound message marks them unread.
UPDATE leads
SET last_read_at = now()
WHERE last_read_at IS NULL;
