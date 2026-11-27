-- Children's test photos and voice recordings are kept for a month, then deleted; the school is told before.
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS retention_notice_at timestamptz;--> statement-breakpoint
ALTER TABLE schools ADD COLUMN IF NOT EXISTS voice_notice_at timestamptz;--> statement-breakpoint

-- Watched tests whose first photos will be deleted within p_before days: each is returned once (then marked).
CREATE OR REPLACE FUNCTION claim_retention_notices(p_days int, p_before int)
RETURNS TABLE (assessment_id uuid, publisher_id uuid, school_id uuid, teacher_id uuid, title text, delete_on date)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    SELECT a.id, min(e.created_at) AS first FROM assessments a JOIN proctor_events e ON e.assessment_id = a.id
    WHERE a.retention_notice_at IS NULL GROUP BY a.id
    HAVING min(e.created_at) < now() - make_interval(days => greatest(p_days - p_before, 0))
  ), marked AS (
    UPDATE assessments a SET retention_notice_at = now() FROM due WHERE a.id = due.id
    RETURNING a.id, a.publisher_id, a.school_id, a.teacher_id, a.title, (due.first + make_interval(days => p_days))::date AS delete_on
  ) SELECT * FROM marked;
$$;--> statement-breakpoint

-- Schools with children's voice recordings that will be deleted within p_before days (at most one notice a week per school).
CREATE OR REPLACE FUNCTION claim_voice_notices(p_days int, p_before int)
RETURNS TABLE (school_id uuid, publisher_id uuid, clips int, admin_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    SELECT c.school_id, c.publisher_id, count(*)::int AS clips FROM audio_clips c
    WHERE c.created_at < now() - make_interval(days => greatest(p_days - p_before, 0))
      AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = c.owner_id AND r.role = 'STUDENT')
    GROUP BY c.school_id, c.publisher_id
  ), marked AS (
    UPDATE schools s SET voice_notice_at = now() FROM due
    WHERE s.id = due.school_id AND (s.voice_notice_at IS NULL OR s.voice_notice_at < now() - interval '6 days')
    RETURNING s.id
  ) SELECT d.school_id, d.publisher_id, d.clips,
      (SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'SCHOOL_ADMIN' WHERE u.school_id = d.school_id AND u.status = 'ACTIVE' ORDER BY u.created_at LIMIT 1)
    FROM due d JOIN marked m ON m.id = d.school_id;
$$;--> statement-breakpoint

-- Deletes children's voice recordings older than p_days; a voice message keeps a short note instead. Returns the files to remove.
CREATE OR REPLACE FUNCTION purge_student_voice(p_days int) RETURNS SETOF text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(c.id) INTO ids FROM audio_clips c
  WHERE c.created_at < now() - make_interval(days => greatest(p_days, 7))
    AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = c.owner_id AND r.role = 'STUDENT');
  IF ids IS NULL THEN RETURN; END IF;
  UPDATE messages SET body = '🎤 Voice message (removed after ' || greatest(p_days, 7) || ' days)' WHERE audio_id = ANY(ids) AND body = '';
  RETURN QUERY DELETE FROM audio_clips WHERE id = ANY(ids) RETURNING storage_key;
END $$;--> statement-breakpoint

-- Phone room-scan links: old ones go, with any panorama that was never added to a test.
CREATE OR REPLACE FUNCTION purge_room_scan_links(p_days int) RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (DELETE FROM room_scan_links WHERE created_at < now() - make_interval(days => greatest(p_days, 7)) RETURNING panorama_file, video_file)
  SELECT f FROM gone, LATERAL (VALUES (panorama_file), (video_file)) v(f)
  WHERE f IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proctor_events e WHERE e.file = f);
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION claim_retention_notices(int, int), claim_voice_notices(int, int), purge_student_voice(int), purge_room_scan_links(int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_retention_notices(int, int), claim_voice_notices(int, int), purge_student_voice(int), purge_room_scan_links(int) TO edubooks_app;
