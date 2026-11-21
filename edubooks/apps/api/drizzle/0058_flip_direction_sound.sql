-- Reading direction of a book part: AUTO (right-to-left when the pages are Arabic / Urdu), LTR or RTL
ALTER TABLE book_components ADD COLUMN IF NOT EXISTS reading_direction text NOT NULL DEFAULT 'AUTO';--> statement-breakpoint
ALTER TABLE book_components DROP CONSTRAINT IF EXISTS book_components_reading_direction_ck;--> statement-breakpoint
ALTER TABLE book_components ADD CONSTRAINT book_components_reading_direction_ck CHECK (reading_direction IN ('AUTO', 'LTR', 'RTL'));--> statement-breakpoint
-- The publisher's own page-turn sound (an uploaded audio file), used by every flipbook
CREATE OR REPLACE FUNCTION set_flip_sound(asset uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_is_staff() OR app_publisher() IS NULL THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  IF asset IS NOT NULL AND NOT EXISTS (SELECT 1 FROM digital_assets WHERE id = asset AND publisher_id = app_publisher()) THEN RAISE EXCEPTION 'unknown file' USING ERRCODE = '22023'; END IF;
  UPDATE publishers SET settings = CASE WHEN asset IS NULL THEN coalesce(settings, '{}'::jsonb) - 'flipSound' ELSE jsonb_set(coalesce(settings, '{}'::jsonb), '{flipSound}', to_jsonb(asset::text)) END WHERE id = app_publisher();
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION set_flip_sound(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION set_flip_sound(uuid) TO edubooks_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION flip_sound() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nullif(settings ->> 'flipSound', '')::uuid FROM publishers WHERE id = app_publisher()
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION flip_sound() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION flip_sound() TO edubooks_app;
