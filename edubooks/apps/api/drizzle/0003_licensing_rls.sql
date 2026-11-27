-- Phase 3: tenant isolation, immutability and expiry for commerce & licensing.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_years','products','product_versions','bundle_items','orders','order_lines','fulfillments',
    'license_adjustments','license_pools','license_seats','license_assignments','license_transfers','access_entitlements']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  -- Publisher catalogue: readable in the tenant, writable by publisher staff.
  FOREACH t IN ARRAY ARRAY['products','product_versions','bundle_items'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (publisher_id = app_publisher())', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff())', t || '_write', t);
  END LOOP;
  -- School-private commercial records: a school reads only its own; only publisher staff write.
  FOREACH t IN ARRAY ARRAY['academic_years','orders','order_lines','fulfillments','license_adjustments','license_pools'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff())', t || '_write', t);
  END LOOP;
  -- Seat allocation records: the school itself (school admin, via the API) may write rows of its own school.
  FOREACH t IN ARRAY ARRAY['license_seats','license_assignments','license_transfers','access_entitlements'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school())) WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))', t || '_tenant', t);
  END LOOP;
END $$;--> statement-breakpoint

-- ---------- privilege-escalation guards ----------
ALTER TABLE user_roles ADD CONSTRAINT user_roles_scope_ck CHECK ((role::text LIKE 'PUBLISHER_%') = (school_id IS NULL));--> statement-breakpoint
DROP POLICY user_roles_tenant ON user_roles;--> statement-breakpoint
CREATE POLICY user_roles_tenant ON user_roles
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school() OR user_id = app_user()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR (school_id = app_school() AND role IN ('SCHOOL_ADMIN','TEACHER','STUDENT'))));--> statement-breakpoint
DROP POLICY users_tenant ON users;--> statement-breakpoint
CREATE POLICY users_tenant ON users
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school() OR id = app_user()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint

-- ---------- sold product versions are frozen ----------
CREATE OR REPLACE FUNCTION product_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Product version % is % and cannot be deleted', OLD.version_no, lower(OLD.status::text); END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' THEN
    IF OLD.status = 'ACTIVE' AND NEW.status = 'RETIRED'
       AND (NEW.price_minor, NEW.currency, NEW.product_id, NEW.version_no) IS NOT DISTINCT FROM (OLD.price_minor, OLD.currency, OLD.product_id, OLD.version_no) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Product version % is % — its contents and price are frozen. Create a new version instead.', OLD.version_no, lower(OLD.status::text);
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER product_version_guard BEFORE UPDATE OR DELETE ON product_versions FOR EACH ROW EXECUTE FUNCTION product_version_guard();--> statement-breakpoint

CREATE OR REPLACE FUNCTION bundle_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st version_status;
BEGIN
  SELECT status INTO st FROM product_versions WHERE id = coalesce(NEW.product_version_id, OLD.product_version_id);
  IF st IS NOT NULL AND st <> 'DRAFT' THEN
    RAISE EXCEPTION 'This product version is % — its books cannot change. Create a new version instead.', lower(st::text);
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;--> statement-breakpoint
CREATE TRIGGER bundle_item_guard BEFORE INSERT OR UPDATE OR DELETE ON bundle_items FOR EACH ROW EXECUTE FUNCTION bundle_item_guard();--> statement-breakpoint

-- Pools never change quantity or source after creation (seats were materialised from it).
CREATE OR REPLACE FUNCTION pool_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.quantity, NEW.fulfillment_id, NEW.adjustment_id, NEW.product_version_id, NEW.school_id, NEW.seat_type)
     IS DISTINCT FROM (OLD.quantity, OLD.fulfillment_id, OLD.adjustment_id, OLD.product_version_id, OLD.school_id, OLD.seat_type) THEN
    RAISE EXCEPTION 'Licence pools are immutable; issue an adjustment or a new order instead';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER pool_guard BEFORE UPDATE ON license_pools FOR EACH ROW EXECUTE FUNCTION pool_guard();--> statement-breakpoint

CREATE SEQUENCE IF NOT EXISTS order_no_seq START 1001;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE order_no_seq TO edubooks_app;--> statement-breakpoint
REVOKE DELETE ON license_assignments, license_transfers, license_seats, license_pools, fulfillments, license_adjustments FROM edubooks_app;--> statement-breakpoint

-- ---------- automatic expiry (cross-tenant maintenance job) ----------
CREATE OR REPLACE FUNCTION expire_licences() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; r record;
BEGIN
  FOR r IN UPDATE license_pools SET status = 'EXPIRED'
           WHERE status IN ('ACTIVE','SUSPENDED') AND valid_until <= now()
           RETURNING id, publisher_id, school_id, quantity, seat_type
  LOOP
    UPDATE access_entitlements e SET active = false FROM license_assignments a WHERE a.id = e.assignment_id AND a.pool_id = r.id AND e.active;
    UPDATE license_assignments SET status = 'EXPIRED', ended_at = now(), end_reason = 'Licence period ended'
     WHERE pool_id = r.id AND status IN ('ACTIVE','SUSPENDED');
    INSERT INTO audit_logs(publisher_id, school_id, action, entity_type, entity_id, summary)
    VALUES (r.publisher_id, r.school_id, 'licensing.pool.expire', 'license_pool', r.id, format('%s %s seats expired (licence period ended)', r.quantity, lower(r.seat_type::text)));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION expire_licences() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION expire_licences() TO edubooks_app;--> statement-breakpoint

-- ---------- demo schools stop working at their expiry date ----------
CREATE OR REPLACE FUNCTION auth_find_login(p_school_code text, p_username text)
RETURNS TABLE (user_id uuid, publisher_id uuid, school_id uuid, password_hash text, user_status account_status, school_status account_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.publisher_id, u.school_id, u.password_hash, u.status,
         CASE WHEN s.is_demo AND s.demo_expires_at < now() THEN 'SUSPENDED'::account_status ELSE s.status END
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
     AND (u.school_id IS NULL OR (s.status = 'ACTIVE' AND NOT (s.is_demo AND s.demo_expires_at < now())))
   GROUP BY se.id, u.id, s.id;
END $$;
