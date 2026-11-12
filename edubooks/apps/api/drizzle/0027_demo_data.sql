-- Demo data that a publisher admin can load for testing and remove again. Every demo item is listed here.
CREATE TABLE demo_records (
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  kind text NOT NULL,
  ref_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (publisher_id, kind, ref_id)
);--> statement-breakpoint
ALTER TABLE demo_records ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY demo_records_staff ON demo_records USING (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT ON demo_records TO edubooks_app;--> statement-breakpoint

-- Frozen product versions may be deleted only by the owner-run demo removal.
CREATE OR REPLACE FUNCTION purging_demo() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.purging_demo', true), '') = 'on'
    AND current_user = (SELECT tableowner::text FROM pg_tables WHERE schemaname = 'public' AND tablename = 'product_versions')
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION product_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' AND NOT purging_demo() THEN RAISE EXCEPTION 'Product version % is % and cannot be deleted', OLD.version_no, lower(OLD.status::text); END IF;
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
CREATE OR REPLACE FUNCTION bundle_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st version_status;
BEGIN
  IF TG_OP = 'DELETE' AND purging_demo() THEN RETURN OLD; END IF;
  SELECT status INTO st FROM product_versions WHERE id = coalesce(NEW.product_version_id, OLD.product_version_id);
  IF st IS NOT NULL AND st <> 'DRAFT' THEN
    RAISE EXCEPTION 'This product version is % — its books cannot change. Create a new version instead.', lower(st::text);
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;--> statement-breakpoint

-- Deletes rows by id together with everything that depends on them (following foreign keys that are
-- RESTRICT / NO ACTION / CASCADE; SET NULL links are left to the database). Stops with an error if a
-- real (non-demo) school owns any of the rows, so real data is never removed.
CREATE OR REPLACE FUNCTION demo_purge(p_table regclass, p_ids uuid[], p_demo_schools uuid[], p_depth int DEFAULT 0) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; child_ids uuid[]; has_id boolean; has_school boolean; real_school text;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RETURN; END IF;
  IF p_depth > 25 THEN RAISE EXCEPTION 'Demo removal went too deep at %', p_table; END IF;
  SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = p_table AND attname = 'school_id' AND NOT attisdropped) INTO has_school;
  IF has_school AND p_table <> 'schools'::regclass THEN
    EXECUTE format('SELECT s.name FROM %s t JOIN schools s ON s.id = t.school_id WHERE t.id = ANY($1) AND NOT (t.school_id = ANY($2)) LIMIT 1', p_table)
      INTO real_school USING p_ids, coalesce(p_demo_schools, '{}'::uuid[]);
    IF real_school IS NOT NULL THEN RAISE EXCEPTION 'Demo data is in use by the real school "%". Remove it there first (%).', real_school, p_table; END IF;
  END IF;
  FOR r IN SELECT c.conrelid::regclass AS child, a.attname AS col
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = p_table AND cardinality(c.conkey) = 1 AND c.confdeltype IN ('a', 'r', 'c')
  LOOP
    SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = r.child AND attname = 'id' AND NOT attisdropped) INTO has_id;
    IF has_id THEN
      EXECUTE format('SELECT array_agg(id) FROM %s WHERE %I = ANY($1)', r.child, r.col) INTO child_ids USING p_ids;
      PERFORM demo_purge(r.child, child_ids, p_demo_schools, p_depth + 1);
    ELSE
      SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = r.child AND attname = 'school_id' AND NOT attisdropped) INTO has_school;
      IF has_school THEN
        EXECUTE format('SELECT s.name FROM %s t JOIN schools s ON s.id = t.school_id WHERE t.%I = ANY($1) AND NOT (t.school_id = ANY($2)) LIMIT 1', r.child, r.col)
          INTO real_school USING p_ids, coalesce(p_demo_schools, '{}'::uuid[]);
        IF real_school IS NOT NULL THEN RAISE EXCEPTION 'Demo data is in use by the real school "%". Remove it there first (%).', real_school, r.child; END IF;
      END IF;
      EXECUTE format('DELETE FROM %s WHERE %I = ANY($1)', r.child, r.col) USING p_ids;
    END IF;
  END LOOP;
  EXECUTE format('DELETE FROM %s WHERE id = ANY($1)', p_table) USING p_ids;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION demo_purge(regclass, uuid[], uuid[], int) FROM PUBLIC;--> statement-breakpoint

CREATE OR REPLACE FUNCTION remove_demo_data(p_publisher uuid, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_schools uuid[]; v_ids uuid[]; v_counts jsonb := '{}'; k text; a uuid; v_keys text[] := '{}'; v_key text;
BEGIN
  IF p_publisher IS DISTINCT FROM app_publisher() OR NOT app_is_staff() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  PERFORM set_config('app.purging_demo', 'on', true);
  SELECT coalesce(array_agg(ref_id), '{}') INTO v_schools FROM demo_records WHERE publisher_id = p_publisher AND kind = 'school';
  v_counts := jsonb_build_object('schools', cardinality(v_schools));
  PERFORM demo_purge('schools', v_schools, v_schools);
  DELETE FROM audit_logs WHERE school_id = ANY(v_schools);
  FOREACH k IN ARRAY ARRAY['game_activities', 'training_courses', 'products', 'book_packages'] LOOP
    SELECT coalesce(array_agg(ref_id), '{}') INTO v_ids FROM demo_records WHERE publisher_id = p_publisher AND kind = k;
    v_counts := v_counts || jsonb_build_object(k, cardinality(v_ids));
    PERFORM demo_purge(k::regclass, v_ids, v_schools);
  END LOOP;
  -- Files: removed only when nothing else uses them; their storage keys are returned so the app can delete the files.
  FOR a IN SELECT ref_id FROM demo_records WHERE publisher_id = p_publisher AND kind = 'digital_assets' LOOP
    BEGIN
      DELETE FROM digital_assets WHERE id = a RETURNING storage_key INTO v_key;
      IF v_key IS NOT NULL THEN v_keys := v_keys || v_key; END IF;
    EXCEPTION WHEN foreign_key_violation THEN NULL; -- still used by real content: keep it
    END;
  END LOOP;
  DELETE FROM demo_records WHERE publisher_id = p_publisher;
  INSERT INTO audit_logs (publisher_id, actor_user_id, action, entity_type, summary)
    VALUES (p_publisher, p_actor, 'system.demo.remove', 'publisher', 'Removed the demo data');
  RETURN v_counts || jsonb_build_object('files', v_keys);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION remove_demo_data(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION remove_demo_data(uuid, uuid) TO edubooks_app;
