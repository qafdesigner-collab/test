-- Company profile, currency/tax and region settings (kept in publishers.settings), and company documents.
CREATE OR REPLACE FUNCTION set_publisher_setting(p_key text, p_value jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_publisher() IS NULL OR NOT app_is_staff() THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF p_key NOT IN ('company', 'finance', 'region') THEN RAISE EXCEPTION 'Unknown setting %', p_key; END IF;
  UPDATE publishers SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), ARRAY[p_key], p_value) WHERE id = app_publisher();
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION set_publisher_setting(text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION set_publisher_setting(text, jsonb) TO edubooks_app;--> statement-breakpoint

CREATE TABLE company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  asset_id uuid NOT NULL REFERENCES digital_assets(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'OTHER' CHECK (category IN ('PROFILE', 'BROCHURE', 'CATALOGUE', 'PRICE_LIST', 'CERTIFICATE', 'OTHER')),
  visibility text NOT NULL DEFAULT 'SCHOOLS' CHECK (visibility IN ('PUBLIC', 'SCHOOLS', 'STAFF')),
  sort int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY company_documents_read ON company_documents FOR SELECT USING (publisher_id = app_publisher() AND (app_is_staff() OR visibility <> 'STAFF'));--> statement-breakpoint
CREATE POLICY company_documents_write ON company_documents FOR ALL USING (publisher_id = app_publisher() AND app_is_staff()) WITH CHECK (publisher_id = app_publisher() AND app_is_staff());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON company_documents TO edubooks_app;--> statement-breakpoint
-- New product versions take the publisher's currency (set by the app); the old default is only a fallback.
ALTER TABLE product_versions ALTER COLUMN currency SET DEFAULT 'AED';
