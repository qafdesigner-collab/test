-- How each written answer was made (pasted, typed, time) and an AI-writing estimate. Shown only to teachers.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS integrity jsonb NOT NULL DEFAULT '{}';
