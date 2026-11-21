-- Groups of students inside a class (e.g. "Reading group A", "Needs support"): a teacher makes them and can set work for a group
CREATE TABLE IF NOT EXISTS student_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  color text NOT NULL DEFAULT 'violet',
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS student_groups_class_idx ON student_groups (class_id);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS student_group_members (
  group_id uuid NOT NULL REFERENCES student_groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, student_id)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS student_group_members_student_idx ON student_group_members (student_id);--> statement-breakpoint
ALTER TABLE student_groups ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE student_group_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS student_groups_school ON student_groups;--> statement-breakpoint
CREATE POLICY student_groups_school ON student_groups
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
DROP POLICY IF EXISTS student_group_members_school ON student_group_members;--> statement-breakpoint
CREATE POLICY student_group_members_school ON student_group_members
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON student_groups, student_group_members TO edubooks_app;
