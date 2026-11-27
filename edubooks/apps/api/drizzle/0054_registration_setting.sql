-- Publisher staff open or close the "Register your school" page (only this one setting of the publisher row).
CREATE OR REPLACE FUNCTION set_school_self_registration(on_off boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_is_staff() OR app_publisher() IS NULL THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE publishers SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{schoolSelfRegistration}', to_jsonb(CASE WHEN on_off THEN 'on' ELSE 'off' END)) WHERE id = app_publisher();
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION set_school_self_registration(boolean) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION set_school_self_registration(boolean) TO edubooks_app;
