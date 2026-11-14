-- Every staff user can connect their own mailbox (send and receive from their own address),
-- and send bulk email campaigns in timed batches.
CREATE TABLE user_mail_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 200),
  from_name text NOT NULL DEFAULT '',
  username text NOT NULL DEFAULT '',
  password_enc text NOT NULL DEFAULT '',
  smtp_host text NOT NULL DEFAULT '',
  smtp_port int NOT NULL DEFAULT 465 CHECK (smtp_port BETWEEN 1 AND 65535),
  smtp_secure boolean NOT NULL DEFAULT true,
  imap_host text NOT NULL DEFAULT '',
  imap_port int NOT NULL DEFAULT 993 CHECK (imap_port BETWEEN 1 AND 65535),
  imap_secure boolean NOT NULL DEFAULT true,
  signature text NOT NULL DEFAULT '' CHECK (length(signature) <= 2000),
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE user_mail_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY user_mail_accounts_own ON user_mail_accounts USING (user_id = app_user() AND publisher_id = app_publisher()) WITH CHECK (user_id = app_user() AND publisher_id = app_publisher());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON user_mail_accounts TO edubooks_app;--> statement-breakpoint

-- Messages received in the user's own mailbox (copied in when they open their email inbox).
CREATE TABLE user_mail_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  uid bigint NOT NULL,
  message_id text NOT NULL DEFAULT '',
  from_name text NOT NULL DEFAULT '',
  from_email text NOT NULL DEFAULT '',
  to_text text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  sent_at timestamptz,
  body text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, uid)
);--> statement-breakpoint
CREATE INDEX user_mail_inbox_user_idx ON user_mail_inbox (user_id, sent_at DESC);--> statement-breakpoint
ALTER TABLE user_mail_inbox ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY user_mail_inbox_own ON user_mail_inbox USING (user_id = app_user() AND publisher_id = app_publisher()) WITH CHECK (user_id = app_user() AND publisher_id = app_publisher());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON user_mail_inbox TO edubooks_app;--> statement-breakpoint

-- Outside email addresses a mail was also sent to.
ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS external_to text[] NOT NULL DEFAULT '{}';--> statement-breakpoint

-- Bulk email campaigns: sent in batches (e.g. 50 emails every 10 minutes), optionally starting later.
CREATE TABLE mail_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 50000),
  audience_label text NOT NULL DEFAULT '',
  batch_size int NOT NULL DEFAULT 50 CHECK (batch_size BETWEEN 1 AND 500),
  interval_min int NOT NULL DEFAULT 10 CHECK (interval_min BETWEEN 1 AND 1440),
  starts_at timestamptz NOT NULL DEFAULT now(),
  next_at timestamptz,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SCHEDULED', 'SENDING', 'PAUSED', 'DONE', 'CANCELLED')),
  use_own_account boolean NOT NULL DEFAULT true,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);--> statement-breakpoint
CREATE INDEX mail_campaigns_due_idx ON mail_campaigns (next_at) WHERE status IN ('SCHEDULED', 'SENDING');--> statement-breakpoint
CREATE TABLE mail_campaign_recipients (
  campaign_id uuid NOT NULL REFERENCES mail_campaigns(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  error text,
  sent_at timestamptz,
  PRIMARY KEY (campaign_id, email)
);--> statement-breakpoint
CREATE INDEX mail_campaign_recipients_pending_idx ON mail_campaign_recipients (campaign_id) WHERE status = 'PENDING';--> statement-breakpoint
ALTER TABLE mail_campaigns ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE mail_campaign_recipients ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY mail_campaigns_own ON mail_campaigns USING (owner_id = app_user() AND publisher_id = app_publisher()) WITH CHECK (owner_id = app_user() AND publisher_id = app_publisher());--> statement-breakpoint
CREATE POLICY mail_campaign_recipients_own ON mail_campaign_recipients USING (owner_id = app_user() AND publisher_id = app_publisher()) WITH CHECK (owner_id = app_user() AND publisher_id = app_publisher());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON mail_campaigns, mail_campaign_recipients TO edubooks_app;--> statement-breakpoint

-- The background sender finds campaigns that are due (all publishers) and then works as the campaign's owner.
CREATE OR REPLACE FUNCTION mail_campaigns_due(p_limit int) RETURNS TABLE (id uuid, owner_id uuid, publisher_id uuid, school_id uuid, roles text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.owner_id, c.publisher_id, c.school_id, array(SELECT r.role::text FROM user_roles r WHERE r.user_id = c.owner_id)
  FROM mail_campaigns c JOIN users u ON u.id = c.owner_id AND u.status = 'ACTIVE'
  WHERE c.status IN ('SCHEDULED', 'SENDING') AND c.next_at <= now() ORDER BY c.next_at LIMIT p_limit
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mail_campaigns_due(int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mail_campaigns_due(int) TO edubooks_app;
