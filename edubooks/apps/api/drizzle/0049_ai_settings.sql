-- The AI model the super admin connected in the app (free services such as Google Gemini, Groq or OpenRouter,
-- or the publisher's own server). Takes the place of the AI_* environment settings while switched on.
CREATE TABLE IF NOT EXISTS publisher_ai_settings (
  publisher_id uuid PRIMARY KEY REFERENCES publishers(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  preset text NOT NULL DEFAULT 'custom',
  base_url text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE publisher_ai_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS publisher_ai_settings_staff ON publisher_ai_settings;--> statement-breakpoint
CREATE POLICY publisher_ai_settings_staff ON publisher_ai_settings USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON publisher_ai_settings TO edubooks_app;--> statement-breakpoint
-- Teachers' and students' requests need the model too, but never see the settings table (the key stays encrypted).
CREATE OR REPLACE FUNCTION ai_provider_config() RETURNS TABLE (enabled boolean, preset text, base_url text, model text, api_key text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.enabled, s.preset, s.base_url, s.model, s.api_key, s.updated_at FROM publisher_ai_settings s WHERE s.publisher_id = app_publisher()
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION ai_provider_config() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ai_provider_config() TO edubooks_app;
