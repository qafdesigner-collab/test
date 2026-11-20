-- Backup AI services, used in order when the main one does not answer (e.g. Ollama on a computer that is switched off).
ALTER TABLE publisher_ai_settings ADD COLUMN IF NOT EXISTS backups jsonb NOT NULL DEFAULT '[]';--> statement-breakpoint
DROP FUNCTION IF EXISTS ai_provider_config();--> statement-breakpoint
CREATE FUNCTION ai_provider_config() RETURNS TABLE (enabled boolean, preset text, base_url text, model text, api_key text, updated_at timestamptz, backups jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.enabled, s.preset, s.base_url, s.model, s.api_key, s.updated_at, s.backups FROM publisher_ai_settings s WHERE s.publisher_id = app_publisher()
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION ai_provider_config() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ai_provider_config() TO edubooks_app;
