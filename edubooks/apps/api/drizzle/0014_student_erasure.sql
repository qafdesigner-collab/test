-- Right to erasure: delete one student's personal data in a single transaction.
--
-- The app role cannot do this with plain DELETEs: it has no DELETE on license_assignments, license_transfers or
-- game_attempts, and the RESTRICTIVE "own rows" policies hide some rows from admins. So this is a narrow
-- SECURITY DEFINER function. Because it bypasses RLS, it does its own authorisation against the request's
-- session variables (app.user_id, app.publisher_id, app.school_id, app.staff):
--   * a SCHOOL_ADMIN of the student's own school, signed in to that school, or
--   * a PUBLISHER_ADMIN (publisher staff) of the student's publisher.
-- Only accounts whose only role is STUDENT can be erased, and the caller must repeat the username.
--
-- Nothing personal is kept: the users row is deleted (not renamed), with everything that belongs to it.
-- The licence seat goes back to AVAILABLE so the school can give it to another child.
-- The audit entry records only that an erasure happened, by whom, and how many rows were removed per table.
CREATE OR REPLACE FUNCTION erase_student(p_school_id uuid, p_user_id uuid, p_confirm_username text, p_ip text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u record;
  caller uuid := app_user();
  pub uuid := app_publisher();
  assignment_ids uuid[];
  n integer;
  counts jsonb := '{}'::jsonb;
BEGIN
  IF caller IS NULL OR pub IS NULL OR p_school_id IS NULL THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  -- Who may erase: the school's own admin (signed in to that school), or the publisher's admin.
  IF NOT (
       (app_school() = p_school_id AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = caller AND r.role = 'SCHOOL_ADMIN' AND r.school_id = p_school_id))
    OR (app_is_staff() AND app_school() IS NULL AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = caller AND r.role = 'PUBLISHER_ADMIN' AND r.publisher_id = pub))
  ) THEN
    RAISE EXCEPTION 'Only the school admin or the publisher admin can erase a student''s data' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO u FROM users WHERE id = p_user_id AND school_id = p_school_id AND publisher_id = pub FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found in this school' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role <> 'STUDENT')
     OR NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'STUDENT') THEN
    RAISE EXCEPTION 'Only student accounts can be erased';
  END IF;
  IF p_confirm_username IS NULL OR u.username <> btrim(p_confirm_username)::citext THEN
    RAISE EXCEPTION 'The confirmation does not match the student''s username';
  END IF;

  -- 1. Licences: free the seats of live assignments, then remove the student's licence history.
  SELECT coalesce(array_agg(id), '{}') INTO assignment_ids FROM license_assignments WHERE user_id = u.id;
  UPDATE license_seats s SET status = 'AVAILABLE'
    FROM license_assignments a
   WHERE a.user_id = u.id AND a.status IN ('ACTIVE','SUSPENDED') AND s.id = a.seat_id AND s.status = 'ASSIGNED';
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('seats_freed', n);
  -- Transfer requests from or to this student (their reason text can describe the child).
  DELETE FROM license_transfers
   WHERE to_user_id = u.id OR assignment_id = ANY(assignment_ids) OR new_assignment_id = ANY(assignment_ids);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('license_transfers', n);
  -- Another child's seat that came from this student keeps working; only the link to the erased record goes.
  UPDATE license_assignments SET transferred_from_id = NULL WHERE transferred_from_id = ANY(assignment_ids);
  DELETE FROM access_entitlements WHERE user_id = u.id OR assignment_id = ANY(assignment_ids);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('access_entitlements', n);
  DELETE FROM license_assignments WHERE id = ANY(assignment_ids);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('license_assignments', n);

  -- 2. Learning records.
  DELETE FROM reader_progress WHERE user_id = u.id;          GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('reader_progress', n);
  DELETE FROM bookmarks WHERE user_id = u.id;                GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('bookmarks', n);
  DELETE FROM submissions WHERE student_id = u.id;           GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('submissions', n);
  DELETE FROM evaluations WHERE student_id = u.id;           GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('evaluations', n);
  DELETE FROM assessment_students WHERE student_id = u.id;   GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('assessment_students', n);
  DELETE FROM game_attempts WHERE student_id = u.id;         GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('game_attempts', n);
  DELETE FROM student_badges WHERE student_id = u.id;        GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('student_badges', n);
  DELETE FROM enrolments WHERE student_id = u.id;            GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('enrolments', n);

  -- 3. The account itself (sessions and roles first so the counts are explicit; anything else cascades).
  DELETE FROM sessions WHERE user_id = u.id;                 GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('sessions', n);
  DELETE FROM user_roles WHERE user_id = u.id;
  DELETE FROM users WHERE id = u.id;

  -- 4. Audit: that an erasure happened, who did it, and the row counts. No name, username or id of the child.
  INSERT INTO audit_logs(publisher_id, school_id, actor_user_id, action, entity_type, entity_id, summary, after, ip)
  VALUES (pub, p_school_id, caller, 'school.user.erase', 'user', NULL, 'Erased a student''s personal data (right to erasure)', counts, p_ip);

  RETURN counts;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION erase_student(uuid, uuid, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION erase_student(uuid, uuid, text, text) TO edubooks_app;
