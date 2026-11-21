-- School admins may edit ONLY their own school's contact details (not name, code or status).
CREATE OR REPLACE FUNCTION school_update_profile(p_city text, p_phone text, p_address text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_school() IS NULL THEN RAISE EXCEPTION 'No school context'; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = app_user() AND school_id = app_school() AND role = 'SCHOOL_ADMIN') THEN
    RAISE EXCEPTION 'Only the school admin can edit the school profile';
  END IF;
  UPDATE schools SET city = coalesce(p_city, city), phone = coalesce(p_phone, phone), address = coalesce(p_address, address), updated_at = now()
   WHERE id = app_school();
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION school_update_profile(text, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION school_update_profile(text, text, text) TO edubooks_app;
