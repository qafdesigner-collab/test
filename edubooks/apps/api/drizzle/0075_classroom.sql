-- Teacher feedback with stickers and a voice note, class reward goals, and the parents' Friday summary.
ALTER TABLE audio_clips DROP CONSTRAINT IF EXISTS audio_clips_kind_check;--> statement-breakpoint
ALTER TABLE audio_clips ADD CONSTRAINT audio_clips_kind_check CHECK (kind IN ('MESSAGE', 'READING', 'FEEDBACK'));--> statement-breakpoint

CREATE TABLE IF NOT EXISTS work_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('SUBMISSION', 'PAGE_WORK')),
  target_id uuid NOT NULL,
  stickers text[] NOT NULL DEFAULT '{}',
  voice_id uuid REFERENCES audio_clips(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_kind, target_id)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_feedback_student_idx ON work_feedback (student_id, updated_at DESC);--> statement-breakpoint
ALTER TABLE work_feedback ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS work_feedback_school ON work_feedback;--> statement-breakpoint
CREATE POLICY work_feedback_school ON work_feedback
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON work_feedback TO edubooks_app;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS class_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reward text NOT NULL CHECK (length(reward) BETWEEN 2 AND 120),
  emoji text NOT NULL DEFAULT '🎉',
  target int NOT NULL CHECK (target BETWEEN 10 AND 10000),
  starts_at timestamptz NOT NULL DEFAULT now(),
  reached_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DONE', 'STOPPED')),
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS class_goals_one_active ON class_goals (class_id) WHERE status = 'ACTIVE';--> statement-breakpoint
ALTER TABLE class_goals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS class_goals_school ON class_goals;--> statement-breakpoint
CREATE POLICY class_goals_school ON class_goals
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON class_goals TO edubooks_app;--> statement-breakpoint

-- One Friday summary per parent, child and week.
CREATE TABLE IF NOT EXISTS weekly_digests (
  parent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, student_id, week_start)
);--> statement-breakpoint
ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS weekly_digests_school ON weekly_digests;--> statement-breakpoint
CREATE POLICY weekly_digests_school ON weekly_digests
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON weekly_digests TO edubooks_app;--> statement-breakpoint
-- the Friday job runs across schools: it lists the parent–child pairs not yet sent this week
CREATE OR REPLACE FUNCTION weekly_digest_due(p_week date) RETURNS TABLE (parent_id uuid, student_id uuid, publisher_id uuid, school_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ps.parent_id, ps.student_id, ps.publisher_id, ps.school_id FROM parent_students ps
    JOIN users p ON p.id = ps.parent_id AND p.status = 'ACTIVE' JOIN users s ON s.id = ps.student_id AND s.status = 'ACTIVE'
    JOIN schools sc ON sc.id = ps.school_id AND sc.status = 'ACTIVE'
   WHERE NOT EXISTS (SELECT 1 FROM weekly_digests d WHERE d.parent_id = ps.parent_id AND d.student_id = ps.student_id AND d.week_start = p_week)
   LIMIT 5000;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION weekly_digest_due(date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION weekly_digest_due(date) TO edubooks_app;
