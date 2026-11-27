-- A book (licence) assigned to a class: its students and teachers get seats, and so do people who join the class later.
CREATE TABLE class_books (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  pool_id uuid NOT NULL REFERENCES license_pools(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, pool_id)
);--> statement-breakpoint
CREATE INDEX class_books_pool_idx ON class_books (pool_id);--> statement-breakpoint
ALTER TABLE class_books ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY class_books_scope ON class_books
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON class_books TO edubooks_app;
