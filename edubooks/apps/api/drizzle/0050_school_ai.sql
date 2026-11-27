-- AI per school, set by the publisher: OFF, PUBLISHER (uses the publisher's AI) or OWN (the school connects its own
-- AI service and key). Monthly request limit and a monthly AI fee for billing. The school's own key is encrypted.
CREATE TABLE IF NOT EXISTS school_ai_settings (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  access text NOT NULL DEFAULT 'PUBLISHER' CHECK (access IN ('OFF', 'PUBLISHER', 'OWN')),
  monthly_limit int CHECK (monthly_limit IS NULL OR monthly_limit BETWEEN 0 AND 10000000),
  fee_minor bigint CHECK (fee_minor IS NULL OR fee_minor >= 0),
  billing_note text NOT NULL DEFAULT '',
  preset text NOT NULL DEFAULT '',
  base_url text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE school_ai_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS school_ai_settings_scope ON school_ai_settings;--> statement-breakpoint
-- the publisher sets everything; a school admin may read and write only its own row (the API decides which fields)
CREATE POLICY school_ai_settings_scope ON school_ai_settings
  USING (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()))
  WITH CHECK (publisher_id = app_publisher() AND (app_is_staff() OR school_id = app_school()));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON school_ai_settings TO edubooks_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION school_ai_config() RETURNS TABLE (access text, monthly_limit int, preset text, base_url text, model text, api_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.access, s.monthly_limit, s.preset, s.base_url, s.model, s.api_key FROM school_ai_settings s WHERE s.school_id = app_school() AND s.publisher_id = app_publisher()
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION school_ai_config() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION school_ai_config() TO edubooks_app;
