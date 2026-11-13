-- Each school's own details for its prints: name, email, phone, address and logo (set by the school admin).
ALTER TABLE schools ADD COLUMN IF NOT EXISTS email text;--> statement-breakpoint
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_key text;--> statement-breakpoint
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_mime text;--> statement-breakpoint
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_version int;--> statement-breakpoint

CREATE OR REPLACE FUNCTION school_update_details(p_name text, p_email text, p_city text, p_phone text, p_address text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_school() IS NULL THEN RAISE EXCEPTION 'No school context'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = app_user() AND school_id = app_school() AND role = 'SCHOOL_ADMIN') THEN
    RAISE EXCEPTION 'Only the school admin can edit the school profile' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NOT NULL AND length(trim(p_name)) < 2 THEN RAISE EXCEPTION 'The school name is too short'; END IF;
  UPDATE schools SET name = coalesce(nullif(trim(p_name), ''), name), email = CASE WHEN p_email IS NULL THEN email ELSE nullif(trim(p_email), '') END,
    city = coalesce(p_city, city), phone = coalesce(p_phone, phone), address = coalesce(p_address, address), updated_at = now()
   WHERE id = app_school();
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION school_update_details(text, text, text, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION school_update_details(text, text, text, text, text) TO edubooks_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION school_set_logo(p_key text, p_mime text) RETURNS TABLE (old_key text, version int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o text; v int;
BEGIN
  IF app_school() IS NULL OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = app_user() AND school_id = app_school() AND role = 'SCHOOL_ADMIN') THEN
    RAISE EXCEPTION 'Only the school admin can change the logo' USING ERRCODE = '42501';
  END IF;
  SELECT logo_key INTO o FROM schools WHERE id = app_school();
  UPDATE schools SET logo_key = p_key, logo_mime = p_mime, logo_version = CASE WHEN p_key IS NULL THEN NULL ELSE coalesce(logo_version, 0) + 1 END, updated_at = now()
   WHERE id = app_school() RETURNING logo_version INTO v;
  RETURN QUERY SELECT o, v;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION school_set_logo(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION school_set_logo(text, text) TO edubooks_app;
