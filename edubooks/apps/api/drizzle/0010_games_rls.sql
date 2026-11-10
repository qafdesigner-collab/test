ALTER TABLE game_activities ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Publisher library (school_id NULL) is readable by every school of the publisher; school games only by that school.
CREATE POLICY game_activities_read ON game_activities FOR SELECT
  USING (publisher_id = app_publisher() AND (school_id IS NULL OR app_is_staff() OR school_id = app_school()));--> statement-breakpoint
CREATE POLICY game_activities_write ON game_activities FOR ALL
  USING (publisher_id = app_publisher() AND ((school_id IS NULL AND app_is_staff()) OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND ((school_id IS NULL AND app_is_staff()) OR school_id = app_school()));--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['game_assignments','game_attempts','student_badges'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) '
                   'WITH CHECK (publisher_id = app_publisher() AND school_id = app_school())', t || '_school', t);
  END LOOP;
END $$;--> statement-breakpoint
CREATE POLICY game_attempts_own ON game_attempts AS RESTRICTIVE
  USING (student_id = app_user() OR NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = app_user() AND r.role = 'STUDENT'));--> statement-breakpoint
CREATE POLICY student_badges_own ON student_badges AS RESTRICTIVE
  USING (student_id = app_user() OR NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = app_user() AND r.role = 'STUDENT'));--> statement-breakpoint
REVOKE UPDATE, DELETE ON game_attempts FROM edubooks_app;
