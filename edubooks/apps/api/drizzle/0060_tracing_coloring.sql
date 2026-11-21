-- Handwriting tracing and colouring activities
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'TRACING';--> statement-breakpoint
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'COLORING';--> statement-breakpoint
-- A tracing area on a book page (trace the printed letters, or letters typed by the publisher)
ALTER TABLE page_hotspots DROP CONSTRAINT IF EXISTS page_hotspots_kind_check;--> statement-breakpoint
ALTER TABLE page_hotspots ADD CONSTRAINT page_hotspots_kind_check CHECK (kind IN ('NOTE', 'AUDIO', 'VIDEO', 'LINK', 'GAME', 'IMAGE', 'TRACE'));
