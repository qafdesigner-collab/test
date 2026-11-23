-- Room scan with a phone: when the computer's camera cannot turn (a desktop PC), the student opens a one-time link
-- (QR code) on a phone, scans the room there, and the panorama is added to the test.
CREATE TABLE IF NOT EXISTS room_scan_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  done_at timestamptz,
  panorama_file text,
  video_file text,
  coverage int,
  complete boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS room_scan_links_student_idx ON room_scan_links (assessment_id, student_id, created_at DESC);--> statement-breakpoint
ALTER TABLE room_scan_links ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS room_scan_links_school ON room_scan_links;--> statement-breakpoint
CREATE POLICY room_scan_links_school ON room_scan_links
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
DROP POLICY IF EXISTS room_scan_links_own ON room_scan_links;--> statement-breakpoint
CREATE POLICY room_scan_links_own ON room_scan_links AS RESTRICTIVE
  USING (student_id = app_user() OR NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = app_user() AND r.role = 'STUDENT'));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON room_scan_links TO edubooks_app;--> statement-breakpoint
-- The phone has no login: it is identified only by the secret link (stored as a hash), valid for a short time and only once.
CREATE OR REPLACE FUNCTION room_scan_link(p_hash bytea) RETURNS TABLE (id uuid, publisher_id uuid, school_id uuid, assessment_id uuid, student_id uuid, expires_at timestamptz, done boolean, title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.publisher_id, l.school_id, l.assessment_id, l.student_id, l.expires_at, l.done_at IS NOT NULL, a.title
  FROM room_scan_links l JOIN assessments a ON a.id = l.assessment_id WHERE l.token_hash = p_hash;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION room_scan_link(bytea) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION room_scan_link(bytea) TO edubooks_app;
