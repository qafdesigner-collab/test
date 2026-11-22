-- Online exam safety: what the teacher turns on for an assessment.
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS proctor jsonb NOT NULL DEFAULT '{}';--> statement-breakpoint
-- What happened during a try: room scan and camera photos, screen pictures, leaving the page, camera or screen sharing stopped.
CREATE TABLE IF NOT EXISTS proctor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt int NOT NULL DEFAULT 1,
  kind text NOT NULL CHECK (kind IN ('ROOM','CAMERA','SCREEN','AWAY','SCREEN_OFF','CAMERA_OFF','SCREEN_PART','NO_SCREEN','NO_CAMERA','FULLSCREEN_OFF')),
  file text,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS proctor_events_idx ON proctor_events (assessment_id, student_id, created_at);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS proctor_events_age_idx ON proctor_events (created_at);--> statement-breakpoint
ALTER TABLE proctor_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS proctor_events_school ON proctor_events;--> statement-breakpoint
CREATE POLICY proctor_events_school ON proctor_events
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
DROP POLICY IF EXISTS proctor_events_own ON proctor_events;--> statement-breakpoint
CREATE POLICY proctor_events_own ON proctor_events AS RESTRICTIVE
  USING (student_id = app_user() OR NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = app_user() AND r.role = 'STUDENT'));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON proctor_events TO edubooks_app;--> statement-breakpoint
-- Old exam photos are removed after a while (the files are deleted by the app with the names returned here).
CREATE OR REPLACE FUNCTION purge_proctor(p_days int) RETURNS SETOF text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM proctor_events WHERE created_at < now() - make_interval(days => greatest(p_days, 7)) RETURNING file;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION purge_proctor(int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION purge_proctor(int) TO edubooks_app;
