-- Whiteboard v2: shapes (line, arrow, box, circle) and who is watching right now.
ALTER TABLE whiteboard_ops DROP CONSTRAINT IF EXISTS whiteboard_ops_kind_check;--> statement-breakpoint
ALTER TABLE whiteboard_ops ADD CONSTRAINT whiteboard_ops_kind_check CHECK (kind IN ('pts', 'undo', 'clear', 'bg', 'text', 'shape'));--> statement-breakpoint
CREATE TABLE whiteboard_viewers (
  board_id uuid NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);--> statement-breakpoint
ALTER TABLE whiteboard_viewers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY whiteboard_viewers_school ON whiteboard_viewers USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON whiteboard_viewers TO edubooks_app;
