-- Read-aloud self check: Owl listens to the student reading the open page
ALTER TABLE tutor_messages DROP CONSTRAINT IF EXISTS tutor_messages_mode_check;--> statement-breakpoint
ALTER TABLE tutor_messages ADD CONSTRAINT tutor_messages_mode_check CHECK (mode IN ('EXPLAIN', 'ASK', 'QUIZ', 'READ'));--> statement-breakpoint
ALTER TABLE tutor_messages ADD COLUMN IF NOT EXISTS score int;--> statement-breakpoint
-- Contents (units and lessons with their first pages) found automatically in a book part, waiting to be applied
ALTER TABLE book_components ADD COLUMN IF NOT EXISTS contents_suggestion jsonb;
