-- Tenant isolation with Row-Level Security.
-- The runtime role (edubooks_app) is NOT the table owner and has NOBYPASSRLS, so these policies
-- are always enforced for application queries. Each request sets, inside its transaction:
--   app.publisher_id, app.school_id, app.user_id, app.staff ('on' for publisher staff)

CREATE OR REPLACE FUNCTION app_publisher() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.publisher_id', true), '')::uuid $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_school() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.school_id', true), '')::uuid $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_staff() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.staff', true), '') = 'on' $$;--> statement-breakpoint

-- ---------- enable RLS ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['publishers','schools','users','user_roles','sessions','audit_logs','grades','subjects',
    'digital_assets','book_packages','book_editions','book_components','book_units','book_lessons','book_pages','teaching_resources']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;--> statement-breakpoint

CREATE POLICY publishers_tenant ON publishers USING (id = app_publisher());--> statement-breakpoint

CREATE POLICY schools_tenant ON schools
  USING (publisher_id = app_publisher() AND (app_is_staff() OR id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint

CREATE POLICY users_tenant ON users
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school() OR id = app_user()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school() OR id = app_user()));--> statement-breakpoint

CREATE POLICY user_roles_tenant ON user_roles
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school() OR user_id = app_user()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint

CREATE POLICY sessions_own ON sessions USING (user_id = app_user()) WITH CHECK (user_id = app_user());--> statement-breakpoint

CREATE POLICY audit_read ON audit_logs FOR SELECT
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint
CREATE POLICY audit_insert ON audit_logs FOR INSERT
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint

-- Publisher content: readable inside the publisher tenant (finer, licence-based checks are done by the
-- licensing module), writable only by publisher staff.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['grades','subjects','digital_assets','book_packages','book_editions','book_components',
    'book_units','book_lessons','book_pages','teaching_resources']
  LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (publisher_id = app_publisher())', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (publisher_id = app_publisher() AND app_is_staff()) '
                   'WITH CHECK (publisher_id = app_publisher() AND app_is_staff())', t || '_write', t);
  END LOOP;
END $$;--> statement-breakpoint

-- ---------- grants for the runtime role ----------
GRANT USAGE ON SCHEMA public TO edubooks_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO edubooks_app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON audit_logs FROM edubooks_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON publishers FROM edubooks_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO edubooks_app;--> statement-breakpoint

-- ---------- the only cross-tenant read paths: login + session lookup ----------
CREATE OR REPLACE FUNCTION auth_find_login(p_school_code text, p_username text)
RETURNS TABLE (user_id uuid, publisher_id uuid, school_id uuid, password_hash text, user_status account_status, school_status account_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.publisher_id, u.school_id, u.password_hash, u.status, s.status
  FROM users u LEFT JOIN schools s ON s.id = u.school_id
  WHERE u.username = p_username::citext
    AND CASE WHEN coalesce(p_school_code, '') = '' THEN u.school_id IS NULL ELSE s.code = p_school_code::citext END
  LIMIT 2
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION auth_session(p_token_hash bytea)
RETURNS TABLE (session_id uuid, user_id uuid, publisher_id uuid, school_id uuid, username text, display_name text,
               must_change_password boolean, roles text[], school_name text, school_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE sessions SET last_seen_at = now()
   WHERE token_hash = p_token_hash AND last_seen_at < now() - interval '5 minutes';
  RETURN QUERY
  SELECT se.id, u.id, u.publisher_id, u.school_id, u.username::text, u.display_name, u.must_change_password,
         coalesce(array_agg(r.role::text) FILTER (WHERE r.role IS NOT NULL), '{}'), s.name, s.code::text
    FROM sessions se
    JOIN users u ON u.id = se.user_id AND u.status = 'ACTIVE'
    LEFT JOIN schools s ON s.id = u.school_id
    LEFT JOIN user_roles r ON r.user_id = u.id
   WHERE se.token_hash = p_token_hash AND se.revoked_at IS NULL AND se.expires_at > now()
     AND (u.school_id IS NULL OR s.status = 'ACTIVE')
   GROUP BY se.id, u.id, s.id;
END $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION auth_find_login(text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_session(bytea) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_find_login(text, text) TO edubooks_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_session(bytea) TO edubooks_app;
