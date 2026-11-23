-- Profile photos for every account, and personal demo schools for the publisher's sales team.
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_key text;--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_mime text;--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_at timestamptz;--> statement-breakpoint
ALTER TABLE schools ADD COLUMN IF NOT EXISTS demo_owner_id uuid REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS schools_demo_owner_uq ON schools (demo_owner_id) WHERE demo_owner_id IS NOT NULL;--> statement-breakpoint

-- Everyone sets (or removes) only their own photo; returns the old file to delete.
CREATE OR REPLACE FUNCTION set_my_photo(p_key text, p_mime text) RETURNS TABLE (old_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := app_user(); prev text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT photo_key INTO prev FROM users WHERE id = me AND publisher_id = app_publisher();
  UPDATE users SET photo_key = p_key, photo_mime = p_mime, photo_at = CASE WHEN p_key IS NULL THEN NULL ELSE now() END WHERE id = me AND publisher_id = app_publisher();
  RETURN QUERY SELECT prev;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION set_my_photo(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION set_my_photo(text, text) TO edubooks_app;--> statement-breakpoint

-- "Log in as": the super admin for any school account; a sales person only for accounts in demo schools they made.
CREATE OR REPLACE FUNCTION start_impersonation(p_target uuid, p_token_hash bytea, p_expires timestamptz, p_ip text, p_ua text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := app_user(); t users%ROWTYPE; nm text; sid uuid; admin boolean; sales boolean;
BEGIN
  admin := me IS NOT NULL AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = me AND role = 'PUBLISHER_ADMIN' AND publisher_id = app_publisher());
  sales := me IS NOT NULL AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = me AND role = 'PUBLISHER_SALES' AND publisher_id = app_publisher());
  IF NOT admin AND NOT sales THEN RAISE EXCEPTION 'Only the super admin can sign in as another user' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM users WHERE id = p_target;
  IF NOT FOUND OR t.publisher_id <> app_publisher() OR t.school_id IS NULL THEN RAISE EXCEPTION 'Account not found' USING ERRCODE = '42501'; END IF;
  IF NOT admin AND NOT EXISTS (SELECT 1 FROM schools s WHERE s.id = t.school_id AND s.is_demo AND (s.demo_owner_id = me OR s.created_by = me)) THEN
    RAISE EXCEPTION 'You can only open accounts in your own demo schools' USING ERRCODE = '42501';
  END IF;
  SELECT display_name INTO nm FROM users WHERE id = me;
  INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent, impersonator_id, impersonator_name)
    VALUES (p_target, p_token_hash, p_expires, p_ip, left(p_ua, 300), me, nm) RETURNING id INTO sid;
  RETURN sid;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION start_impersonation(uuid, bytea, timestamptz, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION start_impersonation(uuid, bytea, timestamptz, text, text) TO edubooks_app;
--> statement-breakpoint

-- The ready "Demo Class" of a sales person's own demo school: teacher, students and a parent linked (only for that school).
CREATE OR REPLACE FUNCTION setup_personal_demo(p_school uuid, p_year uuid, p_teacher uuid, p_students uuid[], p_parent uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s schools%ROWTYPE; cid uuid; st uuid;
BEGIN
  SELECT * INTO s FROM schools WHERE id = p_school;
  IF NOT FOUND OR NOT s.is_demo OR s.publisher_id <> app_publisher() OR s.demo_owner_id IS DISTINCT FROM app_user() THEN
    RAISE EXCEPTION 'Only for your own demo school' USING ERRCODE = '42501';
  END IF;
  INSERT INTO classes (publisher_id, school_id, academic_year_id, name, section) VALUES (s.publisher_id, s.id, p_year, 'Demo Class', 'A') RETURNING id INTO cid;
  INSERT INTO class_teachers (class_id, user_id, publisher_id, school_id) SELECT cid, p_teacher, s.publisher_id, s.id FROM users WHERE id = p_teacher AND school_id = s.id;
  FOREACH st IN ARRAY p_students LOOP
    INSERT INTO enrolments (class_id, student_id, academic_year_id, publisher_id, school_id) SELECT cid, st, p_year, s.publisher_id, s.id FROM users WHERE id = st AND school_id = s.id;
  END LOOP;
  INSERT INTO parent_students (parent_id, student_id, publisher_id, school_id, relation)
    SELECT p_parent, p_students[1], s.publisher_id, s.id, 'Parent' FROM users WHERE id = p_parent AND school_id = s.id;
  UPDATE users SET must_change_password = false WHERE school_id = s.id;
  RETURN cid;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION setup_personal_demo(uuid, uuid, uuid, uuid[], uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION setup_personal_demo(uuid, uuid, uuid, uuid[], uuid) TO edubooks_app;
