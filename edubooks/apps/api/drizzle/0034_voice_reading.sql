-- Voice notes in chat and read-aloud recordings in homework. Audio stays inside the school.
CREATE TABLE audio_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('MESSAGE', 'READING')),
  storage_key text NOT NULL,
  mime text NOT NULL,
  size_bytes int NOT NULL,
  duration_ms int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX audio_clips_owner_idx ON audio_clips (owner_id, created_at DESC);--> statement-breakpoint
ALTER TABLE audio_clips ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY audio_clips_school ON audio_clips USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON audio_clips TO edubooks_app;--> statement-breakpoint

-- A chat message may be a voice note (text then optional).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_id uuid REFERENCES audio_clips(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_body_check;--> statement-breakpoint
ALTER TABLE messages ADD CONSTRAINT messages_body_check CHECK (length(body) <= 2000 AND (length(body) >= 1 OR audio_id IS NOT NULL));--> statement-breakpoint

-- "Read aloud" questions: the pupil records the reading, the teacher listens and marks it.
ALTER TYPE question_type ADD VALUE IF NOT EXISTS 'READING';
