-- ============================================================
-- TZMICHA CRM 3.0 — Migration 013: Automation Engine
-- Adds the durable execution surface required by the Automations
-- tab: execution counters, scheduled/delayed jobs, event
-- idempotency records and in-app notifications.
--
-- Idempotent — safe to run multiple times.
-- Does NOT duplicate the existing automations / automation_steps /
-- crm3_automation_executions tables.
-- ============================================================

-- ── 1. Extend automations with engine columns ────────────────
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS execution_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_run_at       timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at     timestamptz,
  ADD COLUMN IF NOT EXISTS workflow_version  integer NOT NULL DEFAULT 1;

-- Fast lookups for the trigger dispatcher: active automations per account+trigger
CREATE INDEX IF NOT EXISTS idx_automations_trigger_active
  ON automations(account_id, trigger_type)
  WHERE is_active = true;

-- Fast lookups for time-based triggers
CREATE INDEX IF NOT EXISTS idx_automations_next_run
  ON automations(next_run_at)
  WHERE is_active = true AND next_run_at IS NOT NULL;

-- ── 2. Extend automation_steps for branching (forward compatible) ──
ALTER TABLE automation_steps
  ADD COLUMN IF NOT EXISTS parent_step_id uuid REFERENCES automation_steps(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS branch         text,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_automation_steps_parent
  ON automation_steps(automation_id, position, parent_step_id);

-- ── 3. Scheduled / delayed jobs (durable worker queue) ───────
CREATE TABLE IF NOT EXISTS crm3_automation_scheduled_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  automation_id   uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  execution_id    uuid REFERENCES crm3_automation_executions(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  job_type        text NOT NULL DEFAULT 'resume'
    CHECK (job_type IN ('resume','scheduled_trigger')),
  run_at          timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 3,
  lock_until      timestamptz,
  next_step_index integer NOT NULL DEFAULT 0,
  payload         jsonb NOT NULL DEFAULT '{}',
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_due
  ON crm3_automation_scheduled_jobs(status, run_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_automation_jobs_automation
  ON crm3_automation_scheduled_jobs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_account
  ON crm3_automation_scheduled_jobs(account_id, status);

ALTER TABLE crm3_automation_scheduled_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_automation_jobs_rls ON crm3_automation_scheduled_jobs;
CREATE POLICY crm3_automation_jobs_rls ON crm3_automation_scheduled_jobs
  USING (account_id = get_my_account_id());

-- ── 4. Event idempotency records ─────────────────────────────
-- One row per (account, event_key). Prevents duplicate delivery
-- from firing the same automation twice.
CREATE TABLE IF NOT EXISTS crm3_automation_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_key       text NOT NULL,
  event_type      text NOT NULL,
  automation_id   uuid REFERENCES automations(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES contacts(id) ON DELETE SET NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','completed','failed','skipped')),
  executions_created integer NOT NULL DEFAULT 0,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_automation_events_account
  ON crm3_automation_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_events_key
  ON crm3_automation_events(account_id, event_key);

ALTER TABLE crm3_automation_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm3_automation_events_rls ON crm3_automation_events;
CREATE POLICY crm3_automation_events_rls ON crm3_automation_events
  USING (account_id = get_my_account_id());

-- ── 5. In-app notifications (used by automation actions) ─────
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'info',
  title       text NOT NULL,
  body        text,
  data        jsonb NOT NULL DEFAULT '{}',
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_account
  ON notifications(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(account_id, is_read)
  WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_rls ON notifications;
CREATE POLICY notifications_rls ON notifications
  USING (account_id = get_my_account_id());

-- ── 6. Realtime for scheduled job queue (optional but cheap) ─
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm3_automation_scheduled_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE crm3_automation_scheduled_jobs;
  END IF;
END $$;
