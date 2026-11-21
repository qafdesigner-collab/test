-- AI tutor for pupils: per-school settings and a log of every question (teachers can review it).
CREATE TABLE tutor_settings (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  enabled boolean NOT NULL DEFAULT false,
  daily_limit int NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 200),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE tutor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  edition_id uuid REFERENCES book_editions(id) ON DELETE SET NULL,
  component_id uuid REFERENCES book_components(id) ON DELETE SET NULL,
  page int,
  mode text NOT NULL CHECK (mode IN ('EXPLAIN', 'ASK', 'QUIZ')),
  question text NOT NULL DEFAULT '',
  answer text NOT NULL DEFAULT '',
  sources jsonb NOT NULL DEFAULT '[]',
  flagged boolean NOT NULL DEFAULT false,
  live boolean NOT NULL DEFAULT false,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX tutor_messages_student_idx ON tutor_messages (student_id, created_at DESC);--> statement-breakpoint
CREATE INDEX tutor_messages_school_idx ON tutor_messages (school_id, created_at DESC);--> statement-breakpoint
ALTER TABLE tutor_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE tutor_messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tutor_settings_school ON tutor_settings USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school());--> statement-breakpoint
CREATE POLICY tutor_messages_school ON tutor_messages USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND school_id = app_school() AND student_id = app_user());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON tutor_settings TO edubooks_app;--> statement-breakpoint
GRANT SELECT, INSERT ON tutor_messages TO edubooks_app;--> statement-breakpoint

-- Erasure also removes exam marks, tutor questions and conversations about the pupil.
CREATE OR REPLACE FUNCTION erase_student_data(p_student uuid, p_school uuid, p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user text; v_name text; v_pub uuid; v_anon text; v_u text; v_n text;
BEGIN
  SELECT u.username, u.display_name, u.publisher_id INTO v_user, v_name, v_pub FROM users u
  WHERE u.id = p_student AND u.school_id = p_school AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'STUDENT');
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found in this school'; END IF;
  -- the caller's tenant must own this student (this function bypasses row-level security)
  IF v_pub IS DISTINCT FROM app_publisher() OR NOT (app_is_staff() OR app_school() = p_school) THEN
    RAISE EXCEPTION 'Not allowed for this school';
  END IF;
  IF v_name = 'Deleted student' THEN RAISE EXCEPTION 'This student''s data has already been erased'; END IF;
  v_anon := 'deleted-' || substr(replace(p_student::text, '-', ''), 1, 10);

  DELETE FROM submissions WHERE student_id = p_student;
  DELETE FROM assessment_students WHERE student_id = p_student;
  DELETE FROM enrolments WHERE student_id = p_student;
  DELETE FROM reader_progress WHERE user_id = p_student;
  DELETE FROM bookmarks WHERE user_id = p_student;
  DELETE FROM game_attempts WHERE student_id = p_student;
  DELETE FROM student_badges WHERE student_id = p_student;
  DELETE FROM evaluations WHERE student_id = p_student;
  DELETE FROM notifications WHERE user_id = p_student;
  DELETE FROM message_outbox WHERE user_id = p_student;
  DELETE FROM parent_students WHERE student_id = p_student;
  DELETE FROM access_entitlements WHERE user_id = p_student;
  DELETE FROM sessions WHERE user_id = p_student;
  IF to_regclass('attendance') IS NOT NULL THEN EXECUTE 'DELETE FROM attendance WHERE student_id = $1' USING p_student; END IF;
  DELETE FROM user_activity WHERE user_id = p_student;
  DELETE FROM training_progress WHERE user_id = p_student;
  DELETE FROM exam_marks WHERE student_id = p_student;
  DELETE FROM tutor_messages WHERE student_id = p_student;
  DELETE FROM conversations WHERE student_id = p_student;

  UPDATE users SET display_name = 'Deleted student', username = v_anon, email = NULL, phone = NULL, password_hash = '!erased',
    status = 'SUSPENDED', must_change_password = false, failed_logins = 0, locked_until = NULL, updated_at = now()
  WHERE id = p_student;

  -- scrub earlier audit entries (whole words only, so "Ali" does not touch "Alina")
  v_u := '\m' || regexp_replace(v_user, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M';
  v_n := '\m' || regexp_replace(v_name, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M';
  UPDATE audit_logs SET
    summary = regexp_replace(regexp_replace(summary, v_n, 'Deleted student', 'g'), v_u, v_anon, 'g'),
    before = CASE WHEN before IS NULL THEN NULL ELSE regexp_replace(regexp_replace(before::text, v_n, 'Deleted student', 'g'), v_u, v_anon, 'g')::jsonb END,
    after = CASE WHEN after IS NULL THEN NULL ELSE regexp_replace(regexp_replace(after::text, v_n, 'Deleted student', 'g'), v_u, v_anon, 'g')::jsonb END
  WHERE publisher_id = v_pub AND (school_id = p_school OR school_id IS NULL)
    AND (summary ~ v_n OR summary ~ v_u OR coalesce(before::text, '') ~ v_n OR coalesce(before::text, '') ~ v_u OR coalesce(after::text, '') ~ v_n OR coalesce(after::text, '') ~ v_u);

  INSERT INTO audit_logs (publisher_id, school_id, actor_user_id, action, entity_type, entity_id, summary)
  VALUES (v_pub, p_school, p_actor, 'school.student.erase', 'user', p_student, 'Erased a student''s personal data on request');
  RETURN v_anon;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION erase_student_data(uuid, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION erase_student_data(uuid, uuid, uuid) TO edubooks_app;
