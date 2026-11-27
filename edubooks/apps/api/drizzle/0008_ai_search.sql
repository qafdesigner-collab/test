-- Full-text search over extracted book pages ('simple' config: language-neutral, works for English and Urdu tokens).
ALTER TABLE book_pages ADD COLUMN tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(text_content, ''))) STORED;--> statement-breakpoint
CREATE INDEX book_pages_tsv_idx ON book_pages USING gin (tsv);--> statement-breakpoint
-- Optional semantic search: dimension-free vector so any embedding model can be used (exact search per edition).
-- Skipped when the pgvector extension is not installed (e.g. shared hosting); full-text search still works.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE book_pages ADD COLUMN embedding vector;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY ai_generations_school ON ai_generations
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
REVOKE DELETE ON ai_generations FROM edubooks_app;
