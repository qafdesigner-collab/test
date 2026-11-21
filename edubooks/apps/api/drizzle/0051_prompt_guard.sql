-- Optional safety check for students' questions to Ask Owl: a prompt-attack classifier (Llama Prompt Guard 2) is
-- asked first; questions it scores above the threshold never reach the main AI model.
ALTER TABLE publisher_ai_settings ADD COLUMN IF NOT EXISTS guard_enabled boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE publisher_ai_settings ADD COLUMN IF NOT EXISTS guard_base_url text NOT NULL DEFAULT 'https://api.groq.com/openai/v1';--> statement-breakpoint
ALTER TABLE publisher_ai_settings ADD COLUMN IF NOT EXISTS guard_model text NOT NULL DEFAULT 'meta-llama/llama-prompt-guard-2-86m';--> statement-breakpoint
ALTER TABLE publisher_ai_settings ADD COLUMN IF NOT EXISTS guard_key text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE publisher_ai_settings ADD COLUMN IF NOT EXISTS guard_threshold real NOT NULL DEFAULT 0.5;--> statement-breakpoint
CREATE OR REPLACE FUNCTION ai_guard_config() RETURNS TABLE (enabled boolean, base_url text, model text, api_key text, threshold real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.guard_enabled, s.guard_base_url, s.guard_model, s.guard_key, s.guard_threshold FROM publisher_ai_settings s WHERE s.publisher_id = app_publisher()
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION ai_guard_config() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ai_guard_config() TO edubooks_app;
