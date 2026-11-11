-- Daily activity per user (sign-ins, reading, games, homework), kept by triggers, for learning analytics.
CREATE TABLE user_activity (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  logins int NOT NULL DEFAULT 0,
  reading int NOT NULL DEFAULT 0,
  games int NOT NULL DEFAULT 0,
  homework int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);--> statement-breakpoint
CREATE INDEX user_activity_school_day_idx ON user_activity (school_id, day);--> statement-breakpoint
CREATE INDEX user_activity_pub_day_idx ON user_activity (publisher_id, day);--> statement-breakpoint
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY user_activity_read ON user_activity FOR SELECT
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school() OR user_id = app_user()));--> statement-breakpoint
-- Read-only for the app: rows are written only by the trigger below.
GRANT SELECT ON user_activity TO edubooks_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION track_user_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_kind text;
BEGIN
  IF TG_TABLE_NAME = 'reader_progress' THEN v_user := NEW.user_id; v_kind := 'reading';
  ELSIF TG_TABLE_NAME = 'game_attempts' THEN v_user := NEW.student_id; v_kind := 'games';
  ELSIF TG_TABLE_NAME = 'submissions' THEN v_user := NEW.student_id; v_kind := 'homework';
  ELSIF TG_TABLE_NAME = 'users' THEN v_user := NEW.id; v_kind := 'logins';
  ELSE RETURN NEW; END IF;
  INSERT INTO user_activity (user_id, day, publisher_id, school_id, logins, reading, games, homework)
  SELECT u.id, current_date, u.publisher_id, u.school_id, (v_kind = 'logins')::int, (v_kind = 'reading')::int, (v_kind = 'games')::int, (v_kind = 'homework')::int
  FROM users u WHERE u.id = v_user
  ON CONFLICT (user_id, day) DO UPDATE SET logins = user_activity.logins + excluded.logins, reading = user_activity.reading + excluded.reading,
    games = user_activity.games + excluded.games, homework = user_activity.homework + excluded.homework;
  RETURN NEW;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION track_user_activity() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER reader_progress_activity AFTER INSERT OR UPDATE OF max_page, last_page ON reader_progress FOR EACH ROW EXECUTE FUNCTION track_user_activity();--> statement-breakpoint
CREATE TRIGGER game_attempts_activity AFTER INSERT ON game_attempts FOR EACH ROW EXECUTE FUNCTION track_user_activity();--> statement-breakpoint
CREATE TRIGGER submissions_activity AFTER INSERT ON submissions FOR EACH ROW EXECUTE FUNCTION track_user_activity();--> statement-breakpoint
CREATE TRIGGER users_login_activity AFTER UPDATE OF last_login_at ON users FOR EACH ROW
  WHEN (NEW.last_login_at IS DISTINCT FROM OLD.last_login_at) EXECUTE FUNCTION track_user_activity();--> statement-breakpoint

-- Backfill from what is already recorded.
INSERT INTO user_activity (user_id, day, publisher_id, school_id, logins, reading, games, homework)
SELECT x.user_id, x.day, u.publisher_id, u.school_id, sum(x.l)::int, sum(x.r)::int, sum(x.g)::int, sum(x.h)::int
FROM (
  SELECT user_id, updated_at::date AS day, 0 AS l, 1 AS r, 0 AS g, 0 AS h FROM reader_progress
  UNION ALL SELECT student_id, created_at::date, 0, 0, 1, 0 FROM game_attempts
  UNION ALL SELECT student_id, created_at::date, 0, 0, 0, 1 FROM submissions
  UNION ALL SELECT id, last_login_at::date, 1, 0, 0, 0 FROM users WHERE last_login_at IS NOT NULL
) x JOIN users u ON u.id = x.user_id
GROUP BY x.user_id, x.day, u.publisher_id, u.school_id
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Erasure also removes activity and training records.
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
