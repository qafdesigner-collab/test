-- The teacher's live voice on a whiteboard: short sound pieces that students play one after another. Kept for 2 minutes only.
CREATE TABLE IF NOT EXISTS whiteboard_voice (
  seq bigserial PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  mime text NOT NULL,
  data bytea NOT NULL CHECK (octet_length(data) <= 400000),
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS whiteboard_voice_board_idx ON whiteboard_voice (board_id, seq);--> statement-breakpoint
ALTER TABLE whiteboard_voice ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS whiteboard_voice_school ON whiteboard_voice;--> statement-breakpoint
CREATE POLICY whiteboard_voice_school ON whiteboard_voice
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON whiteboard_voice TO edubooks_app;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE whiteboard_voice_seq_seq TO edubooks_app;
