-- Schools that registered themselves from the login page. They wait (school suspended) until the publisher approves.
CREATE TABLE IF NOT EXISTS school_registrations (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  contact_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  school_email text NOT NULL DEFAULT '',
  students int,
  message text NOT NULL DEFAULT '',
  ip text,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE school_registrations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS school_registrations_staff ON school_registrations;--> statement-breakpoint
CREATE POLICY school_registrations_staff ON school_registrations USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_registrations TO edubooks_app;--> statement-breakpoint
-- for the public registration page: the publisher of this site and whether self-registration is open
CREATE OR REPLACE FUNCTION public_registration_info() RETURNS TABLE (publisher_id uuid, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, coalesce(p.settings->>'schoolSelfRegistration', 'on') <> 'off' FROM publishers p ORDER BY p.created_at LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public_registration_info() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_registration_info() TO edubooks_app;--> statement-breakpoint
-- for the login message of a school that is still waiting
CREATE OR REPLACE FUNCTION school_registration_status(s uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT status FROM school_registrations WHERE school_id = s $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION school_registration_status(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION school_registration_status(uuid) TO edubooks_app;
