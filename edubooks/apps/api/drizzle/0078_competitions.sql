-- School competitions (singing, art, poetry…): students enter, students and teachers vote, the school admin announces the results.
ALTER TABLE audio_clips DROP CONSTRAINT IF EXISTS audio_clips_kind_check;--> statement-breakpoint
ALTER TABLE audio_clips ADD CONSTRAINT audio_clips_kind_check CHECK (kind IN ('MESSAGE', 'READING', 'FEEDBACK', 'ENTRY'));--> statement-breakpoint

CREATE TABLE IF NOT EXISTS competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  category text NOT NULL DEFAULT 'OTHER',
  emoji text NOT NULL DEFAULT '🏆' CHECK (length(emoji) <= 16),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 3000),
  entry_kind text NOT NULL DEFAULT 'ANY' CHECK (entry_kind IN ('PHOTO', 'AUDIO', 'TEXT', 'ANY')),
  class_ids uuid[] NOT NULL DEFAULT '{}',
  entries_until timestamptz,
  voting_until timestamptz,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'VOTING', 'RESULTS')),
  student_votes boolean NOT NULL DEFAULT true,
  teacher_votes boolean NOT NULL DEFAULT true,
  results_note text NOT NULL DEFAULT '' CHECK (length(results_note) <= 1000),
  results_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS competitions_school_idx ON competitions (school_id, created_at DESC);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS competition_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  image_key text,
  audio_id uuid REFERENCES audio_clips(id) ON DELETE SET NULL,
  place int CHECK (place BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, student_id)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS competition_votes (
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES competition_entries(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (competition_id, voter_id)
);--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['competitions', 'competition_entries', 'competition_votes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_school', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school())', t || '_school', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO edubooks_app', t);
  END LOOP;
END $$;
