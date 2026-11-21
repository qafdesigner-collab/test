-- The publisher can switch a book off for one school (INACTIVE) or take it away (REMOVED), whatever licences the school holds.
-- Both can be undone. Checked wherever licences give access, so the book is closed for the school's admins, teachers and students.
CREATE TABLE IF NOT EXISTS school_book_blocks (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  package_id uuid NOT NULL REFERENCES book_packages(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('INACTIVE', 'REMOVED')),
  reason text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, package_id)
);--> statement-breakpoint
ALTER TABLE school_book_blocks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS school_book_blocks_read ON school_book_blocks;--> statement-breakpoint
CREATE POLICY school_book_blocks_read ON school_book_blocks FOR SELECT
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint
DROP POLICY IF EXISTS school_book_blocks_write ON school_book_blocks;--> statement-breakpoint
CREATE POLICY school_book_blocks_write ON school_book_blocks FOR ALL
  USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_book_blocks TO edubooks_app;
