-- Assessments: a time limit, and up to 3 tries when the teacher allows it.
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS time_limit_min int;--> statement-breakpoint
ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_attempts_ck;--> statement-breakpoint
ALTER TABLE assessments ADD CONSTRAINT assessments_attempts_ck CHECK (max_attempts BETWEEN 1 AND 3 AND (time_limit_min IS NULL OR time_limit_min BETWEEN 1 AND 600));--> statement-breakpoint
-- Earlier tries of a submission (answers, score, times); the submission row holds the latest try.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS attempt int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]';--> statement-breakpoint
-- When each try was started and handed in (the timer).
CREATE TABLE IF NOT EXISTS assessment_attempts (
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt int NOT NULL CHECK (attempt BETWEEN 1 AND 3),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  over_time boolean NOT NULL DEFAULT false,
  PRIMARY KEY (assessment_id, student_id, attempt)
);--> statement-breakpoint
ALTER TABLE assessment_attempts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS assessment_attempts_school ON assessment_attempts;--> statement-breakpoint
CREATE POLICY assessment_attempts_school ON assessment_attempts
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
DROP POLICY IF EXISTS assessment_attempts_own ON assessment_attempts;--> statement-breakpoint
CREATE POLICY assessment_attempts_own ON assessment_attempts AS RESTRICTIVE
  USING (student_id = app_user() OR NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = app_user() AND r.role = 'STUDENT'));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON assessment_attempts TO edubooks_app;--> statement-breakpoint
-- students only ever see their own book work, too
DROP POLICY IF EXISTS page_work_own ON page_work;--> statement-breakpoint
CREATE POLICY page_work_own ON page_work AS RESTRICTIVE
  USING (student_id = app_user() OR NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = app_user() AND r.role = 'STUDENT'));
