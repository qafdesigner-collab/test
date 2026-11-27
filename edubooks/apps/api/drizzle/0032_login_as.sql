-- Super admin "Log in as": a separate, short session for a school user, marked with who opened it.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS impersonator_id uuid REFERENCES users(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS impersonator_name text;--> statement-breakpoint

CREATE OR REPLACE FUNCTION start_impersonation(p_target uuid, p_token_hash bytea, p_expires timestamptz, p_ip text, p_ua text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := app_user(); t users%ROWTYPE; nm text; sid uuid;
BEGIN
  IF me IS NULL OR NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = me AND role = 'PUBLISHER_ADMIN' AND publisher_id = app_publisher()) THEN
    RAISE EXCEPTION 'Only the super admin can sign in as another user' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM users WHERE id = p_target;
  IF NOT FOUND OR t.publisher_id <> app_publisher() OR t.school_id IS NULL THEN RAISE EXCEPTION 'Account not found' USING ERRCODE = '42501'; END IF;
  SELECT display_name INTO nm FROM users WHERE id = me;
  INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent, impersonator_id, impersonator_name)
    VALUES (p_target, p_token_hash, p_expires, p_ip, left(p_ua, 300), me, nm) RETURNING id INTO sid;
  RETURN sid;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION start_impersonation(uuid, bytea, timestamptz, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION start_impersonation(uuid, bytea, timestamptz, text, text) TO edubooks_app;
--> statement-breakpoint

-- The session check also tells the app when a session is a super admin's "Log in as".
DROP FUNCTION IF EXISTS auth_session(bytea, integer);--> statement-breakpoint
CREATE FUNCTION auth_session(p_token_hash bytea, p_idle_minutes integer DEFAULT 720)
RETURNS TABLE (session_id uuid, user_id uuid, publisher_id uuid, school_id uuid, username text, display_name text,
               must_change_password boolean, roles text[], school_name text, school_code text, impersonator_id uuid, impersonator_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE sessions SET last_seen_at = now()
   WHERE token_hash = p_token_hash AND revoked_at IS NULL
     AND last_seen_at < now() - interval '5 minutes' AND last_seen_at > now() - make_interval(mins => p_idle_minutes);
  RETURN QUERY
  SELECT se.id, u.id, u.publisher_id, u.school_id, u.username::text, u.display_name, u.must_change_password,
         coalesce(array_agg(r.role::text) FILTER (WHERE r.role IS NOT NULL), '{}'), s.name, s.code::text, se.impersonator_id, se.impersonator_name
    FROM sessions se
    JOIN users u ON u.id = se.user_id AND u.status = 'ACTIVE'
    LEFT JOIN schools s ON s.id = u.school_id
    LEFT JOIN user_roles r ON r.user_id = u.id
   WHERE se.token_hash = p_token_hash AND se.revoked_at IS NULL AND se.expires_at > now()
     AND se.last_seen_at > now() - make_interval(mins => p_idle_minutes)
     AND (u.school_id IS NULL OR (s.status = 'ACTIVE' AND NOT (s.is_demo AND s.demo_expires_at < now())))
   GROUP BY se.id, u.id, s.id;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_session(bytea, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_session(bytea, integer) TO edubooks_app;
