-- Teacher's adjustments to a pupil's automatic term progress (score and/or comment).
CREATE TABLE progress_overrides (
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('T1', 'T2', 'T3', 'FINAL')),
  score numeric(5,1) CHECK (score BETWEEN 0 AND 100),
  comment text NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id, period)
);--> statement-breakpoint
ALTER TABLE progress_overrides ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY progress_overrides_school ON progress_overrides USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON progress_overrides TO edubooks_app;
