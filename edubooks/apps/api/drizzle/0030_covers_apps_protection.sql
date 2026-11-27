-- Book cover mockups, CD and mobile-app book parts, and content-protection settings.
ALTER TABLE book_packages ADD COLUMN cover_key text, ADD COLUMN cover_mime text, ADD COLUMN cover_version text;--> statement-breakpoint
ALTER TYPE component_type ADD VALUE IF NOT EXISTS 'CD';--> statement-breakpoint
ALTER TYPE component_type ADD VALUE IF NOT EXISTS 'MOBILE_APP';--> statement-breakpoint
CREATE TABLE book_apps (
  component_id uuid PRIMARY KEY REFERENCES book_components(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  asset_id uuid REFERENCES digital_assets(id) ON DELETE SET NULL,
  android_url text,
  ios_url text,
  version text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE book_apps ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY book_apps_read ON book_apps FOR SELECT USING (publisher_id = app_publisher());--> statement-breakpoint
CREATE POLICY book_apps_write ON book_apps FOR ALL USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON book_apps TO edubooks_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_publisher_setting(p_key text, p_value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_publisher() IS NULL OR NOT app_is_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF p_key NOT IN ('company', 'finance', 'region', 'protection') THEN RAISE EXCEPTION 'Unknown setting %', p_key; END IF;
  UPDATE publishers SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), ARRAY[p_key], p_value) WHERE id = app_publisher();
END $$;--> statement-breakpoint
-- Read by every signed-in user (to switch the viewer guards on), so it is exposed through a narrow function.
CREATE OR REPLACE FUNCTION content_protection() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(settings -> 'protection', '{}'::jsonb) FROM publishers WHERE id = app_publisher()
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION content_protection() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION content_protection() TO edubooks_app;
