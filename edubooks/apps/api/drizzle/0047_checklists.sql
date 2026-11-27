-- Evaluation checklists: a teacher lists skills/criteria for a class and marks each student on a simple scale.
CREATE TABLE IF NOT EXISTS checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  term text NOT NULL DEFAULT '',
  scale text NOT NULL DEFAULT 'THREE' CHECK (scale IN ('THREE', 'FOUR', 'YESNO')),
  items jsonb NOT NULL DEFAULT '[]',
  edition_id uuid REFERENCES book_editions(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES book_units(id) ON DELETE SET NULL,
  shared boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS checklists_class_idx ON checklists (class_id);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS checklist_marks (
  checklist_id uuid NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  marks jsonb NOT NULL DEFAULT '{}',
  comment text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (checklist_id, student_id)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS checklist_marks_student_idx ON checklist_marks (student_id);--> statement-breakpoint
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE checklist_marks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS checklists_school ON checklists;--> statement-breakpoint
CREATE POLICY checklists_school ON checklists
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
DROP POLICY IF EXISTS checklist_marks_school ON checklist_marks;--> statement-breakpoint
CREATE POLICY checklist_marks_school ON checklist_marks
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON checklists, checklist_marks TO edubooks_app;
