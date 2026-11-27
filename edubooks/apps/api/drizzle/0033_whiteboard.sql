-- Live whiteboard: a teacher writes, the pupils of the class watch it live (optionally over a book page).
CREATE TABLE whiteboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  live boolean NOT NULL DEFAULT true,
  edition_id uuid REFERENCES book_editions(id) ON DELETE SET NULL,
  component_id uuid REFERENCES book_components(id) ON DELETE SET NULL,
  page int,
  seq bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);--> statement-breakpoint
CREATE INDEX whiteboards_class_idx ON whiteboards (class_id, live, updated_at DESC);--> statement-breakpoint
CREATE TABLE whiteboard_ops (
  board_id uuid NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('pts', 'undo', 'clear', 'bg', 'text')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, seq)
);--> statement-breakpoint
ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE whiteboard_ops ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY whiteboards_school ON whiteboards USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
CREATE POLICY whiteboard_ops_school ON whiteboard_ops USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON whiteboards, whiteboard_ops TO edubooks_app;
