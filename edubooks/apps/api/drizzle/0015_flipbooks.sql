-- Flipbooks: an HTML flipbook (zip with index.html) or a Flash flipbook (SWF, played with Ruffle) per book part.
CREATE TABLE flipbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  component_id uuid NOT NULL REFERENCES book_components(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('HTML', 'SWF')),
  storage_prefix text NOT NULL,
  entry text NOT NULL,
  file_count integer NOT NULL,
  total_bytes bigint NOT NULL,
  original_name text NOT NULL,
  skipped_files integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX flipbooks_component_uq ON flipbooks (component_id);--> statement-breakpoint
CREATE TABLE flipbook_files (
  flipbook_id uuid NOT NULL REFERENCES flipbooks(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  path text NOT NULL,
  size_bytes bigint NOT NULL,
  mime_type text NOT NULL,
  PRIMARY KEY (flipbook_id, path)
);--> statement-breakpoint
ALTER TABLE flipbooks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE flipbook_files ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY flipbooks_read ON flipbooks FOR SELECT USING (publisher_id = app_publisher());--> statement-breakpoint
CREATE POLICY flipbooks_write ON flipbooks FOR ALL USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
CREATE POLICY flipbook_files_read ON flipbook_files FOR SELECT USING (publisher_id = app_publisher());--> statement-breakpoint
CREATE POLICY flipbook_files_write ON flipbook_files FOR ALL USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON flipbooks, flipbook_files TO edubooks_app;
