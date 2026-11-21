-- Written term exams: a paper (sections of questions), printed and sat in class; marks typed in afterwards.
CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  edition_id uuid REFERENCES book_editions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  term text NOT NULL DEFAULT '',
  exam_date date,
  duration_min int NOT NULL DEFAULT 60 CHECK (duration_min BETWEEN 5 AND 600),
  instructions text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY', 'PUBLISHED')),
  results_published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX exams_class_idx ON exams (class_id, exam_date);--> statement-breakpoint
CREATE TABLE exam_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  section text NOT NULL DEFAULT 'A',
  position int NOT NULL DEFAULT 0,
  type text NOT NULL CHECK (type IN ('MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT', 'LONG')),
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  answer jsonb NOT NULL DEFAULT '[]',
  marks numeric(5,1) NOT NULL DEFAULT 1 CHECK (marks > 0 AND marks <= 100),
  lines int NOT NULL DEFAULT 0 CHECK (lines BETWEEN 0 AND 40)
);--> statement-breakpoint
CREATE INDEX exam_items_exam_idx ON exam_items (exam_id, section, position);--> statement-breakpoint
CREATE TABLE exam_marks (
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  marks numeric(6,1),
  absent boolean NOT NULL DEFAULT false,
  remarks text NOT NULL DEFAULT '',
  entered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exam_id, student_id),
  CONSTRAINT exam_marks_ck CHECK (marks IS NULL OR marks >= 0)
);--> statement-breakpoint
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE exam_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE exam_marks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY exams_school ON exams USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
CREATE POLICY exam_items_school ON exam_items USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
CREATE POLICY exam_marks_school ON exam_marks USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON exams, exam_items, exam_marks TO edubooks_app;
