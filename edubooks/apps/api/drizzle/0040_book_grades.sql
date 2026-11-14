-- A school can use a book for more grades than the publisher set (e.g. a KG book also for KG2).
CREATE TABLE school_book_grades (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, product_id, grade_id)
);--> statement-breakpoint
ALTER TABLE school_book_grades ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY school_book_grades_scope ON school_book_grades
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_book_grades TO edubooks_app;
