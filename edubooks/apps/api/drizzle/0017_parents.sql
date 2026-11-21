-- Parent accounts (role PARENT, belong to a school) linked to their children.
ALTER TYPE role ADD VALUE IF NOT EXISTS 'PARENT';--> statement-breakpoint
-- (role::text so the new enum value is not used inside this transaction)
DROP POLICY user_roles_tenant ON user_roles;--> statement-breakpoint
CREATE POLICY user_roles_tenant ON user_roles
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school() OR user_id = app_user()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR (school_id = app_school() AND role::text IN ('SCHOOL_ADMIN','TEACHER','STUDENT','PARENT'))));--> statement-breakpoint
CREATE TABLE parent_students (
  parent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'Parent',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, student_id)
);--> statement-breakpoint
CREATE INDEX parent_students_student_idx ON parent_students (student_id);--> statement-breakpoint
ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY parent_students_school ON parent_students
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON parent_students TO edubooks_app;
