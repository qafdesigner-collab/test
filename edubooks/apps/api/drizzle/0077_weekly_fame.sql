-- Weekly lesson plans made by hand (book → part → lesson / pages → resources, per day) and the school's Hall of Fame.
CREATE TABLE IF NOT EXISTS weekly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 160),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 3000),
  entries jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS weekly_plans_teacher_idx ON weekly_plans (teacher_id, week_start DESC);--> statement-breakpoint
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS weekly_plans_school ON weekly_plans;--> statement-breakpoint
CREATE POLICY weekly_plans_school ON weekly_plans
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON weekly_plans TO edubooks_app;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS hall_of_fame (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('STUDENT', 'LEADER')),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 120),
  achievement text NOT NULL DEFAULT '' CHECK (length(achievement) <= 600),
  year text NOT NULL DEFAULT '' CHECK (length(year) <= 20),
  emoji text NOT NULL DEFAULT '🏆' CHECK (length(emoji) <= 16),
  avatar text,
  sort int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE hall_of_fame ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS hall_of_fame_school ON hall_of_fame;--> statement-breakpoint
CREATE POLICY hall_of_fame_school ON hall_of_fame
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON hall_of_fame TO edubooks_app;--> statement-breakpoint
-- who sees the Hall of Fame (the school admin decides): on/off, and for teachers, students and parents
ALTER TABLE schools ADD COLUMN IF NOT EXISTS fame_settings jsonb NOT NULL DEFAULT '{"enabled": true, "teachers": true, "students": true, "parents": true}';--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_fame_settings(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s uuid := app_school(); v jsonb;
BEGIN
  IF s IS NULL OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = app_user() AND role = 'SCHOOL_ADMIN' AND school_id = s) THEN
    RAISE EXCEPTION 'Only the school admin can change this' USING ERRCODE = '42501';
  END IF;
  v := jsonb_build_object('enabled', coalesce((p->>'enabled')::boolean, true), 'teachers', coalesce((p->>'teachers')::boolean, true),
    'students', coalesce((p->>'students')::boolean, true), 'parents', coalesce((p->>'parents')::boolean, true));
  UPDATE schools SET fame_settings = v WHERE id = s;
  RETURN v;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION set_fame_settings(jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION set_fame_settings(jsonb) TO edubooks_app;
