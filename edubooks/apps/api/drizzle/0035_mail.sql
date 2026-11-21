-- Built-in mail: an inbox for every user, messages to people or groups, meeting invites with replies,
-- and copies to real email addresses through the publisher's SMTP account.
CREATE TABLE mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_name text NOT NULL DEFAULT '',
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
  kind text NOT NULL DEFAULT 'MAIL' CHECK (kind IN ('MAIL', 'MEETING')),
  meeting jsonb,
  to_label text NOT NULL DEFAULT '',
  reply_to uuid REFERENCES mail_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX mail_messages_sender_idx ON mail_messages (sender_id, created_at DESC);--> statement-breakpoint
CREATE TABLE mail_recipients (
  message_id uuid NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  read_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  rsvp text CHECK (rsvp IN ('YES', 'NO', 'MAYBE')),
  rsvp_at timestamptz,
  emailed_at timestamptz,
  PRIMARY KEY (message_id, user_id)
);--> statement-breakpoint
CREATE INDEX mail_recipients_user_idx ON mail_recipients (user_id, archived, message_id);--> statement-breakpoint
ALTER TABLE mail_messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE mail_recipients ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- A school user sees mail of their school, mail they sent, and mail sent to them (e.g. from the publisher).
CREATE POLICY mail_recipients_scope ON mail_recipients
  USING (publisher_id = app_publisher() AND (app_is_staff() OR user_id = app_user() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint
CREATE POLICY mail_messages_scope ON mail_messages
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school() OR sender_id = app_user()
    OR EXISTS (SELECT 1 FROM mail_recipients r WHERE r.message_id = id AND r.user_id = app_user())))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON mail_messages, mail_recipients TO edubooks_app;--> statement-breakpoint

-- Outgoing email account (SMTP). Only publisher staff can read or change it; the app reads it for sending
-- through a narrow function, so the password never reaches school users.
CREATE TABLE publisher_mail_settings (
  publisher_id uuid PRIMARY KEY REFERENCES publishers(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  host text NOT NULL DEFAULT '',
  port int NOT NULL DEFAULT 465,
  secure boolean NOT NULL DEFAULT true,
  username text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  from_name text NOT NULL DEFAULT '',
  from_email text NOT NULL DEFAULT '',
  notify_students boolean NOT NULL DEFAULT true,
  site_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE publisher_mail_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY publisher_mail_settings_staff ON publisher_mail_settings USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON publisher_mail_settings TO edubooks_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION mail_smtp_config() RETURNS TABLE (enabled boolean, host text, port int, secure boolean, username text, password text, from_name text, from_email text, notify_students boolean, site_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.enabled, s.host, s.port, s.secure, s.username, s.password, s.from_name, s.from_email, s.notify_students, s.site_url FROM publisher_mail_settings s WHERE s.publisher_id = app_publisher()
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mail_smtp_config() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mail_smtp_config() TO edubooks_app;
--> statement-breakpoint

-- School users may write to the publisher's super admins; they cannot list publisher staff otherwise.
CREATE OR REPLACE FUNCTION publisher_mail_contacts() RETURNS TABLE (id uuid, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.display_name FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'PUBLISHER_ADMIN'
  WHERE u.publisher_id = app_publisher() AND u.school_id IS NULL AND u.status = 'ACTIVE' AND app_publisher() IS NOT NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION publisher_mail_contacts() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION publisher_mail_contacts() TO edubooks_app;
