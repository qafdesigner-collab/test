-- The school's own list of class rewards (added by the school admin or teachers), offered when starting a class goal.
CREATE TABLE IF NOT EXISTS school_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT '🎁' CHECK (length(emoji) <= 16),
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 120),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, title)
);--> statement-breakpoint
ALTER TABLE school_rewards ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS school_rewards_school ON school_rewards;--> statement-breakpoint
CREATE POLICY school_rewards_school ON school_rewards
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON school_rewards TO edubooks_app;
