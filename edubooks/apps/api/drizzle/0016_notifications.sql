-- In-app notifications, WhatsApp/SMS outbox, licence & demo expiry reminders.
ALTER TABLE users ADD COLUMN phone text;--> statement-breakpoint
ALTER TABLE schools ADD COLUMN notify_settings jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY notifications_own ON notifications FOR SELECT USING (user_id = app_user());--> statement-breakpoint
CREATE POLICY notifications_read_mark ON notifications FOR UPDATE USING (user_id = app_user()) WITH CHECK (user_id = app_user());--> statement-breakpoint
CREATE POLICY notifications_create ON notifications FOR INSERT
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR (school_id IS NOT NULL AND school_id = app_school())));--> statement-breakpoint

CREATE TABLE message_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  channel text NOT NULL DEFAULT 'AUTO',
  to_address text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);--> statement-breakpoint
CREATE INDEX outbox_pending_idx ON message_outbox (status, created_at);--> statement-breakpoint
CREATE INDEX outbox_publisher_idx ON message_outbox (publisher_id, created_at DESC);--> statement-breakpoint
ALTER TABLE message_outbox ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY outbox_read ON message_outbox FOR SELECT
  USING (publisher_id = app_publisher() AND (app_is_staff() OR (school_id IS NOT NULL AND school_id = app_school())));--> statement-breakpoint
CREATE POLICY outbox_create ON message_outbox FOR INSERT
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR (school_id IS NOT NULL AND school_id = app_school())));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON notifications TO edubooks_app;--> statement-breakpoint
GRANT SELECT, INSERT ON message_outbox TO edubooks_app;--> statement-breakpoint

-- Sending worker: claims messages of every publisher (runs without a tenant context).
CREATE OR REPLACE FUNCTION outbox_claim(p_limit integer) RETURNS SETOF message_outbox LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE message_outbox o SET status = 'SENDING', attempts = o.attempts + 1
  WHERE o.id IN (
    SELECT id FROM message_outbox
    WHERE (status = 'PENDING' OR (status = 'FAILED' AND attempts < 3 AND created_at > now() - interval '1 day'))
       OR (status = 'SENDING' AND created_at < now() - interval '15 minutes' AND attempts < 3)
    ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING o.*
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION outbox_done(p_id uuid, p_status text, p_error text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE message_outbox SET status = p_status, last_error = left(p_error, 500), sent_at = CASE WHEN p_status = 'SENT' THEN now() ELSE sent_at END WHERE id = p_id
$$;--> statement-breakpoint

-- Reminders are sent once per school, end date and threshold.
CREATE TABLE reminder_log (key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());--> statement-breakpoint
ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE OR REPLACE FUNCTION queue_reminders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; t int; n int := 0; msg text; pub text;
BEGIN
  -- Licences: 30, 7 and 1 day(s) before a school's active licences end.
  FOR r IN
    SELECT p.publisher_id, p.school_id, s.name AS school, s.phone AS school_phone, p.valid_until::date AS ends, (p.valid_until::date - current_date) AS days_left,
           count(*) AS pools, sum(p.quantity) AS seats
    FROM license_pools p JOIN schools s ON s.id = p.school_id
    WHERE p.status = 'ACTIVE' AND s.status = 'ACTIVE' AND NOT s.is_demo AND p.valid_until::date >= current_date AND p.valid_until::date <= current_date + 30
    GROUP BY 1, 2, 3, 4, 5
  LOOP
    t := CASE WHEN r.days_left <= 1 THEN 1 WHEN r.days_left <= 7 THEN 7 ELSE 30 END;
    CONTINUE WHEN EXISTS (SELECT 1 FROM reminder_log WHERE key = format('lic:%s:%s:%s', r.school_id, r.ends, t));
    INSERT INTO reminder_log(key) VALUES (format('lic:%s:%s:%s', r.school_id, r.ends, t));
    SELECT name INTO pub FROM publishers WHERE id = r.publisher_id;
    msg := format('Book licences of %s end on %s (%s day%s left, %s seats). Contact %s to renew so pupils keep their books.',
                  r.school, to_char(r.ends, 'DD Mon YYYY'), r.days_left, CASE WHEN r.days_left = 1 THEN '' ELSE 's' END, r.seats, pub);
    -- school admins: in-app + phone
    INSERT INTO notifications (publisher_id, school_id, user_id, kind, title, body, link)
    SELECT r.publisher_id, r.school_id, u.id, 'LICENCE_EXPIRY', format('Licences end in %s day%s', r.days_left, CASE WHEN r.days_left = 1 THEN '' ELSE 's' END), msg, '/school/licences'
    FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'SCHOOL_ADMIN' WHERE u.school_id = r.school_id AND u.status = 'ACTIVE';
    INSERT INTO message_outbox (publisher_id, school_id, user_id, kind, to_address, body)
    SELECT r.publisher_id, r.school_id, u.id, 'LICENCE_EXPIRY', u.phone, msg
    FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'SCHOOL_ADMIN' WHERE u.school_id = r.school_id AND u.status = 'ACTIVE' AND coalesce(u.phone, '') <> '';
    IF r.school_phone IS NOT NULL AND r.school_phone <> '' AND NOT EXISTS (
      SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'SCHOOL_ADMIN' WHERE u.school_id = r.school_id AND coalesce(u.phone, '') <> '') THEN
      INSERT INTO message_outbox (publisher_id, school_id, kind, to_address, body) VALUES (r.publisher_id, r.school_id, 'LICENCE_EXPIRY', r.school_phone, msg);
    END IF;
    -- publisher admins and sales: in-app
    INSERT INTO notifications (publisher_id, user_id, kind, title, body, link)
    SELECT r.publisher_id, u.id, 'LICENCE_EXPIRY', format('%s: licences end in %s day%s', r.school, r.days_left, CASE WHEN r.days_left = 1 THEN '' ELSE 's' END),
           format('%s seats in %s licence pool(s) end on %s. Time to renew.', r.seats, r.pools, to_char(r.ends, 'DD Mon YYYY')), format('/admin/schools/%s', r.school_id)
    FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role IN ('PUBLISHER_ADMIN', 'PUBLISHER_SALES')
    WHERE u.publisher_id = r.publisher_id AND u.school_id IS NULL AND u.status = 'ACTIVE';
    n := n + 1;
  END LOOP;
  -- Demo schools: 3 days and 1 day before the demo ends.
  FOR r IN
    SELECT s.publisher_id, s.id AS school_id, s.name AS school, s.demo_expires_at::date AS ends, (s.demo_expires_at::date - current_date) AS days_left
    FROM schools s WHERE s.is_demo AND s.status = 'ACTIVE' AND s.demo_expires_at::date BETWEEN current_date AND current_date + 3
  LOOP
    t := CASE WHEN r.days_left <= 1 THEN 1 ELSE 3 END;
    CONTINUE WHEN EXISTS (SELECT 1 FROM reminder_log WHERE key = format('demo:%s:%s:%s', r.school_id, r.ends, t));
    INSERT INTO reminder_log(key) VALUES (format('demo:%s:%s:%s', r.school_id, r.ends, t));
    INSERT INTO notifications (publisher_id, user_id, kind, title, body, link)
    SELECT r.publisher_id, u.id, 'DEMO_EXPIRY', format('Demo for %s ends in %s day%s', r.school, r.days_left, CASE WHEN r.days_left = 1 THEN '' ELSE 's' END),
           'Follow up now: convert it to a customer school or extend the demo.', format('/admin/schools/%s', r.school_id)
    FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role IN ('PUBLISHER_ADMIN', 'PUBLISHER_SALES')
    WHERE u.publisher_id = r.publisher_id AND u.school_id IS NULL AND u.status = 'ACTIVE';
    n := n + 1;
  END LOOP;
  -- keep the tables small
  DELETE FROM notifications WHERE created_at < now() - interval '180 days';
  DELETE FROM message_outbox WHERE created_at < now() - interval '180 days';
  DELETE FROM reminder_log WHERE created_at < now() - interval '400 days';
  RETURN n;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION outbox_claim(integer), outbox_done(uuid, text, text), queue_reminders() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION outbox_claim(integer), outbox_done(uuid, text, text), queue_reminders() TO edubooks_app;
