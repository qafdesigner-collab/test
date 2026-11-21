-- Three more game engines, and interactive hotspots on book pages.
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'SPELLING_BEE';--> statement-breakpoint
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'SENTENCE_BUILDER';--> statement-breakpoint
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'LISTENING';--> statement-breakpoint
CREATE TABLE page_hotspots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  component_id uuid NOT NULL REFERENCES book_components(id) ON DELETE CASCADE,
  page int NOT NULL CHECK (page BETWEEN 1 AND 5000),
  x real NOT NULL, y real NOT NULL, w real NOT NULL, h real NOT NULL,
  kind text NOT NULL CHECK (kind IN ('NOTE', 'AUDIO', 'VIDEO', 'LINK', 'GAME')),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  url text,
  game_id uuid REFERENCES game_activities(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotspot_box_ck CHECK (x >= 0 AND y >= 0 AND w > 0 AND h > 0 AND x + w <= 1.0001 AND y + h <= 1.0001)
);--> statement-breakpoint
CREATE INDEX page_hotspots_comp_idx ON page_hotspots (component_id, page);--> statement-breakpoint
ALTER TABLE page_hotspots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Everyone in the publisher's tenant may read (the API checks the book licence); only staff write.
CREATE POLICY page_hotspots_read ON page_hotspots FOR SELECT USING (publisher_id = app_publisher());--> statement-breakpoint
CREATE POLICY page_hotspots_write ON page_hotspots FOR ALL
  USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON page_hotspots TO edubooks_app;
