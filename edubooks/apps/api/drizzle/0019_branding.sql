-- Public branding (name, tagline, colour, logo) for the sign-in page, shown before anyone is signed in.
CREATE OR REPLACE FUNCTION public_branding(p_slug text) RETURNS TABLE (publisher_id uuid, name text, branding jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, coalesce(settings -> 'branding', '{}'::jsonb) FROM publishers
  WHERE (coalesce(p_slug, '') = '' OR slug = p_slug) ORDER BY created_at LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public_branding(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_branding(text) TO edubooks_app;
--> statement-breakpoint
-- Publisher staff may change only the branding part of their own publisher's settings.
CREATE OR REPLACE FUNCTION set_branding(p_branding jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_publisher() IS NULL OR NOT app_is_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE publishers SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{branding}', p_branding) WHERE id = app_publisher();
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION set_branding(jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION set_branding(jsonb) TO edubooks_app;
