-- Game collections (General games, Sports…): a publisher game in a collection is offered to every school, with or without a book.
ALTER TABLE game_activities ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS games_categories_idx ON game_activities USING gin (categories);--> statement-breakpoint

-- The school timeline: news, photos and events posted by teachers and the school admin, for the whole school or one class.
CREATE TABLE IF NOT EXISTS timeline_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'POST' CHECK (kind IN ('POST', 'EVENT')),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  event_at timestamptz,
  place text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]',
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(body) <= 5000 AND length(title) <= 200)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS timeline_posts_school_idx ON timeline_posts (school_id, created_at DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS timeline_posts_class_idx ON timeline_posts (class_id, created_at DESC);--> statement-breakpoint
ALTER TABLE timeline_posts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS timeline_posts_school ON timeline_posts;--> statement-breakpoint
CREATE POLICY timeline_posts_school ON timeline_posts
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON timeline_posts TO edubooks_app;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS timeline_likes (
  post_id uuid NOT NULL REFERENCES timeline_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT '❤️',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);--> statement-breakpoint
ALTER TABLE timeline_likes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS timeline_likes_school ON timeline_likes;--> statement-breakpoint
CREATE POLICY timeline_likes_school ON timeline_likes
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND school_id = app_school() AND user_id = app_user());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON timeline_likes TO edubooks_app;
