-- Teacher/school ↔ parent conversations (about one child), announcements, and live online lessons.
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_uq UNIQUE (parent_id, staff_id, student_id)
);--> statement-breakpoint
CREATE INDEX conversations_staff_idx ON conversations (staff_id, last_message_at DESC);--> statement-breakpoint
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX messages_conv_idx ON messages (conversation_id, created_at);--> statement-breakpoint
CREATE TABLE conversation_reads (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);--> statement-breakpoint
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'BOTH' CHECK (audience IN ('STUDENTS', 'PARENTS', 'BOTH')),
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX announcements_school_idx ON announcements (school_id, created_at DESC);--> statement-breakpoint
CREATE TABLE live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 40 CHECK (duration_min BETWEEN 5 AND 300),
  url text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX live_sessions_class_idx ON live_sessions (class_id, starts_at);--> statement-breakpoint
ALTER TABLE timetable_slots ADD COLUMN online_url text;--> statement-breakpoint
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE conversation_reads ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY conversations_school ON conversations USING (publisher_id = app_publisher() AND school_id = app_school()) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
CREATE POLICY messages_school ON messages USING (publisher_id = app_publisher() AND school_id = app_school()) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school() AND sender_id = app_user());--> statement-breakpoint
CREATE POLICY conversation_reads_own ON conversation_reads USING (publisher_id = app_publisher() AND school_id = app_school()) WITH CHECK (publisher_id = app_publisher() AND user_id = app_user());--> statement-breakpoint
CREATE POLICY announcements_school ON announcements USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
CREATE POLICY live_sessions_school ON live_sessions USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations, conversation_reads, announcements, live_sessions TO edubooks_app;--> statement-breakpoint
-- Messages are a record: they can be written and read, not edited or deleted by the app.
GRANT SELECT, INSERT ON messages TO edubooks_app;
