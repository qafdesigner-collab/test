-- Phase 4: every LMS row is private to its school. Fine-grained teacher/student rules live in the API.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['classes','class_teachers','enrolments','reader_progress','bookmarks','lesson_plans','question_bank',
    'assessments','assessment_items','assessment_students','submissions','evaluations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) '
                   'WITH CHECK (publisher_id = app_publisher() AND school_id = app_school())', t || '_school', t);
  END LOOP;
END $$;--> statement-breakpoint
-- Students may only ever touch their own reader data and submissions (second line of defence).
CREATE POLICY reader_progress_own ON reader_progress AS RESTRICTIVE USING (user_id = app_user() OR app_is_staff() OR NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = app_user() AND r.role = 'STUDENT'));--> statement-breakpoint
CREATE POLICY bookmarks_own ON bookmarks AS RESTRICTIVE USING (user_id = app_user());--> statement-breakpoint
CREATE POLICY submissions_student_own ON submissions AS RESTRICTIVE
  USING (student_id = app_user() OR NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = app_user() AND r.role = 'STUDENT'));
