-- Account lockout + session idle timeout (Phase 7).
DROP FUNCTION IF EXISTS auth_find_login(text, text);--> statement-breakpoint
CREATE FUNCTION auth_find_login(p_school_code text, p_username text)
RETURNS TABLE (user_id uuid, publisher_id uuid, school_id uuid, password_hash text, user_status account_status, school_status account_status, locked_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.publisher_id, u.school_id, u.password_hash, u.status,
         CASE WHEN s.is_demo AND s.demo_expires_at < now() THEN 'SUSPENDED'::account_status ELSE s.status END, u.locked_until
  FROM users u LEFT JOIN schools s ON s.id = u.school_id
  WHERE u.username = p_username::citext
    AND CASE WHEN coalesce(p_school_code, '') = '' THEN u.school_id IS NULL ELSE s.code = p_school_code::citext END
  LIMIT 2
$$;--> statement-breakpoint

-- Records a login outcome. 5 failures in a row lock the account for 15 minutes (doubling for each further failure, max 24h).
CREATE OR REPLACE FUNCTION auth_login_result(p_user_id uuid, p_ok boolean) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; until timestamptz;
BEGIN
  IF p_ok THEN
    UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = p_user_id;
    RETURN NULL;
  END IF;
  UPDATE users SET failed_logins = failed_logins + 1 WHERE id = p_user_id RETURNING failed_logins INTO n;
  IF n >= 5 THEN
    until := now() + least(interval '24 hours', interval '15 minutes' * power(2, n - 5));
    UPDATE users SET locked_until = until WHERE id = p_user_id;
  END IF;
  RETURN until;
END $$;--> statement-breakpoint

DROP FUNCTION IF EXISTS auth_session(bytea);--> statement-breakpoint
CREATE FUNCTION auth_session(p_token_hash bytea, p_idle_minutes integer DEFAULT 720)
RETURNS TABLE (session_id uuid, user_id uuid, publisher_id uuid, school_id uuid, username text, display_name text,
               must_change_password boolean, roles text[], school_name text, school_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE sessions SET last_seen_at = now()
   WHERE token_hash = p_token_hash AND revoked_at IS NULL
     AND last_seen_at < now() - interval '5 minutes' AND last_seen_at > now() - make_interval(mins => p_idle_minutes);
  RETURN QUERY
  SELECT se.id, u.id, u.publisher_id, u.school_id, u.username::text, u.display_name, u.must_change_password,
         coalesce(array_agg(r.role::text) FILTER (WHERE r.role IS NOT NULL), '{}'), s.name, s.code::text
    FROM sessions se
    JOIN users u ON u.id = se.user_id AND u.status = 'ACTIVE'
    LEFT JOIN schools s ON s.id = u.school_id
    LEFT JOIN user_roles r ON r.user_id = u.id
   WHERE se.token_hash = p_token_hash AND se.revoked_at IS NULL AND se.expires_at > now()
     AND se.last_seen_at > now() - make_interval(mins => p_idle_minutes)
     AND (u.school_id IS NULL OR (s.status = 'ACTIVE' AND NOT (s.is_demo AND s.demo_expires_at < now())))
   GROUP BY se.id, u.id, s.id;
END $$;--> statement-breakpoint

-- Old sessions are cleaned up by the maintenance job.
CREATE OR REPLACE FUNCTION purge_sessions() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days' RETURNING 1) SELECT count(*)::int FROM d
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION auth_find_login(text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_login_result(uuid, boolean) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_session(bytea, integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION purge_sessions() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_find_login(text, text), auth_login_result(uuid, boolean), auth_session(bytea, integer), purge_sessions() TO edubooks_app;
