-- Lets the runtime role check schema version for /api/health/ready without reading the drizzle schema.
CREATE OR REPLACE FUNCTION applied_migrations() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT count(*)::int FROM drizzle.__drizzle_migrations
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION applied_migrations() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION applied_migrations() TO edubooks_app;
