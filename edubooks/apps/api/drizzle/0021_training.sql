-- Teacher training: publisher-made courses of short lessons (video, reading, link, quiz) and each user's progress.
CREATE TABLE training_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'TEACHER' CHECK (audience IN ('TEACHER', 'SCHOOL_ADMIN', 'ALL')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  color text NOT NULL DEFAULT '#4f46e5',
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE training_courses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY training_courses_read ON training_courses FOR SELECT
  USING (publisher_id = app_publisher() AND (app_is_staff() OR status = 'PUBLISHED'));--> statement-breakpoint
CREATE POLICY training_courses_write ON training_courses FOR ALL
  USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON training_courses TO edubooks_app;--> statement-breakpoint

CREATE TABLE training_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  course_id uuid NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  sort int NOT NULL DEFAULT 0,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('VIDEO', 'TEXT', 'LINK', 'QUIZ')),
  body text NOT NULL DEFAULT '',
  url text,
  quiz jsonb NOT NULL DEFAULT '[]',
  minutes int NOT NULL DEFAULT 5 CHECK (minutes BETWEEN 1 AND 600),
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX training_lessons_course_idx ON training_lessons (course_id, sort);--> statement-breakpoint
ALTER TABLE training_lessons ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY training_lessons_read ON training_lessons FOR SELECT
  USING (publisher_id = app_publisher() AND (app_is_staff() OR EXISTS (SELECT 1 FROM training_courses c WHERE c.id = course_id AND c.status = 'PUBLISHED')));--> statement-breakpoint
CREATE POLICY training_lessons_write ON training_lessons FOR ALL
  USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON training_lessons TO edubooks_app;--> statement-breakpoint

CREATE TABLE training_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  score int,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);--> statement-breakpoint
CREATE INDEX training_progress_course_idx ON training_progress (course_id);--> statement-breakpoint
ALTER TABLE training_progress ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Staff see everyone; a school sees its own people; everyone writes only their own rows.
CREATE POLICY training_progress_read ON training_progress FOR SELECT
  USING (publisher_id = app_publisher() AND (app_is_staff() OR user_id = app_user() OR school_id = app_school()));--> statement-breakpoint
CREATE POLICY training_progress_write ON training_progress FOR ALL
  USING (publisher_id = app_publisher() AND user_id = app_user()) WITH CHECK (publisher_id = app_publisher() AND user_id = app_user());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON training_progress TO edubooks_app;
