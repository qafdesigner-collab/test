-- Daily attendance per class, the school's bell schedule (periods) and each class's weekly timetable.
CREATE TYPE attendance_status AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');--> statement-breakpoint
CREATE TABLE attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  status attendance_status NOT NULL,
  note text NOT NULL DEFAULT '',
  marked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_uq UNIQUE (class_id, student_id, day)
);--> statement-breakpoint
CREATE INDEX attendance_student_day_idx ON attendance (student_id, day);--> statement-breakpoint
CREATE INDEX attendance_school_day_idx ON attendance (school_id, day);--> statement-breakpoint
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY attendance_school ON attendance
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance TO edubooks_app;--> statement-breakpoint

CREATE TABLE timetable_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  number int NOT NULL CHECK (number BETWEEN 1 AND 20),
  label text NOT NULL DEFAULT '',
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  is_break boolean NOT NULL DEFAULT false,
  CONSTRAINT tp_times_ck CHECK (ends_at > starts_at),
  CONSTRAINT tp_uq UNIQUE (school_id, number)
);--> statement-breakpoint
ALTER TABLE timetable_periods ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY timetable_periods_school ON timetable_periods
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON timetable_periods TO edubooks_app;--> statement-breakpoint

CREATE TABLE timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  period int NOT NULL CHECK (period BETWEEN 1 AND 20),
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES users(id) ON DELETE SET NULL,
  room text NOT NULL DEFAULT '',
  CONSTRAINT ts_class_uq UNIQUE (class_id, weekday, period)
);--> statement-breakpoint
-- A teacher cannot be in two classes at the same time.
CREATE UNIQUE INDEX ts_teacher_uq ON timetable_slots (school_id, teacher_id, weekday, period) WHERE teacher_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY timetable_slots_school ON timetable_slots
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON timetable_slots TO edubooks_app;
