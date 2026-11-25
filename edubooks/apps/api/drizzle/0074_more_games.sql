-- More games: Penalty kick and Running race (answer questions), Whack-a-mole (tap the right ones).
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'PENALTY_KICK';--> statement-breakpoint
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'RUNNING_RACE';--> statement-breakpoint
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'WHACK_A_MOLE';--> statement-breakpoint

-- Sample news for a sales person's own demo school (only there).
CREATE OR REPLACE FUNCTION add_demo_post(p_school uuid, p_author uuid, p_class uuid, p_kind text, p_title text, p_body text, p_event_at timestamptz, p_place text, p_images jsonb, p_pinned boolean, p_age interval)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s schools%ROWTYPE; pid uuid;
BEGIN
  SELECT * INTO s FROM schools WHERE id = p_school;
  IF NOT FOUND OR NOT s.is_demo OR s.publisher_id <> app_publisher() OR s.demo_owner_id IS DISTINCT FROM app_user() THEN
    RAISE EXCEPTION 'Only for your own demo school' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_author AND school_id = s.id) THEN RAISE EXCEPTION 'Author not in this school' USING ERRCODE = '42501'; END IF;
  INSERT INTO timeline_posts (publisher_id, school_id, author_id, class_id, kind, title, body, event_at, place, images, pinned, created_at, updated_at)
    VALUES (s.publisher_id, s.id, p_author, p_class, p_kind, p_title, p_body, p_event_at, p_place, p_images, p_pinned, now() - p_age, now() - p_age) RETURNING id INTO pid;
  RETURN pid;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION add_demo_post(uuid, uuid, uuid, text, text, text, timestamptz, text, jsonb, boolean, interval) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION add_demo_post(uuid, uuid, uuid, text, text, text, timestamptz, text, jsonb, boolean, interval) TO edubooks_app;
--> statement-breakpoint

-- When each person last looked at the timeline: newer posts are "new" in the welcome window.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timeline_seen_at timestamptz;--> statement-breakpoint
CREATE OR REPLACE FUNCTION mark_timeline_seen() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users SET timeline_seen_at = now() WHERE id = app_user() AND publisher_id = app_publisher();
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mark_timeline_seen() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mark_timeline_seen() TO edubooks_app;
--> statement-breakpoint

-- A ready-made picture (3D avatar) instead of a photo. Choosing one removes the photo, and a new photo removes the avatar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text;--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_my_avatar(p_avatar text) RETURNS TABLE (old_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := app_user(); prev text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF p_avatar IS NOT NULL AND p_avatar !~ '^[a-z0-9-]{2,30}$' THEN RAISE EXCEPTION 'Unknown picture' USING ERRCODE = '22023'; END IF;
  SELECT photo_key INTO prev FROM users WHERE id = me AND publisher_id = app_publisher();
  UPDATE users SET avatar = p_avatar, photo_key = NULL, photo_mime = NULL, photo_at = CASE WHEN p_avatar IS NULL THEN NULL ELSE now() END
   WHERE id = me AND publisher_id = app_publisher();
  RETURN QUERY SELECT prev;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION set_my_avatar(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION set_my_avatar(text) TO edubooks_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_my_photo(p_key text, p_mime text) RETURNS TABLE (old_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := app_user(); prev text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT photo_key INTO prev FROM users WHERE id = me AND publisher_id = app_publisher();
  UPDATE users SET photo_key = p_key, photo_mime = p_mime, avatar = NULL, photo_at = CASE WHEN p_key IS NULL THEN NULL ELSE now() END
   WHERE id = me AND publisher_id = app_publisher();
  RETURN QUERY SELECT prev;
END $$;
