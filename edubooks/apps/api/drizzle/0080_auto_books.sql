-- "Give automatically": new students and teachers of the book's grade get a seat from this licence by themselves.
CREATE TABLE school_auto_books (
  pool_id uuid PRIMARY KEY REFERENCES license_pools(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE school_auto_books ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY school_auto_books_scope ON school_auto_books
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_auto_books TO edubooks_app;
