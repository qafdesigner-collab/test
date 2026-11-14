-- Optional designation (e.g. "Class teacher", "Head of English") and sign-in with email or login ID.
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation text NOT NULL DEFAULT '';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS users_school_email_idx ON users (school_id, email) WHERE email IS NOT NULL;--> statement-breakpoint

-- A login ID always wins; an email is used only when no account has that login ID.
-- Two accounts sharing one email in the same school make it ambiguous (2 rows), so sign-in by email is refused for them.
CREATE OR REPLACE FUNCTION auth_find_login(p_school_code text, p_username text)
RETURNS TABLE (user_id uuid, publisher_id uuid, school_id uuid, password_hash text, user_status account_status, school_status account_status, locked_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT u.id, u.publisher_id, u.school_id, u.password_hash, u.status,
           CASE WHEN s.is_demo AND s.demo_expires_at < now() THEN 'SUSPENDED'::account_status ELSE s.status END AS sstatus, u.locked_until,
           (u.username = p_username::citext) AS by_id
    FROM users u LEFT JOIN schools s ON s.id = u.school_id
    WHERE (u.username = p_username::citext OR (position('@' in p_username) > 0 AND u.email = p_username::citext))
      AND CASE WHEN coalesce(p_school_code, '') = '' THEN u.school_id IS NULL ELSE s.code = p_school_code::citext END
  )
  SELECT id, publisher_id, school_id, password_hash, status, sstatus, locked_until FROM c
  WHERE by_id OR NOT EXISTS (SELECT 1 FROM c WHERE by_id)
  LIMIT 2
$$;
