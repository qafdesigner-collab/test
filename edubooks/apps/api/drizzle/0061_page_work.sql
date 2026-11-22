-- Book page elements: drawing areas, tracing along a path drawn by the publisher, and the work students send to their teacher
ALTER TABLE page_hotspots ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';--> statement-breakpoint
ALTER TABLE page_hotspots DROP CONSTRAINT IF EXISTS page_hotspots_kind_check;--> statement-breakpoint
ALTER TABLE page_hotspots ADD CONSTRAINT page_hotspots_kind_check CHECK (kind IN ('NOTE', 'AUDIO', 'VIDEO', 'LINK', 'GAME', 'IMAGE', 'TRACE', 'DRAW'));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS page_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotspot_id uuid REFERENCES page_hotspots(id) ON DELETE SET NULL,
  component_id uuid REFERENCES book_components(id) ON DELETE SET NULL,
  page int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('TRACE', 'DRAW')),
  image text NOT NULL CHECK (length(image) <= 1500000),
  stars int CHECK (stars BETWEEN 0 AND 3),
  comment text NOT NULL DEFAULT '',
  commented_by uuid REFERENCES users(id) ON DELETE SET NULL,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS page_work_student_idx ON page_work (student_id, created_at DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS page_work_school_idx ON page_work (school_id, created_at DESC);--> statement-breakpoint
ALTER TABLE page_work ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS page_work_school ON page_work;--> statement-breakpoint
CREATE POLICY page_work_school ON page_work
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON page_work TO edubooks_app;
