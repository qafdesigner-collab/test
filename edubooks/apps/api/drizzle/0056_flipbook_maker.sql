-- A book PDF can be shown as a page-turn flipbook (FLIP) or as plain pages (PDF)
ALTER TABLE book_components ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'PDF';--> statement-breakpoint
ALTER TABLE book_components DROP CONSTRAINT IF EXISTS book_components_display_mode_ck;--> statement-breakpoint
ALTER TABLE book_components ADD CONSTRAINT book_components_display_mode_ck CHECK (display_mode IN ('PDF', 'FLIP'));--> statement-breakpoint
-- Elements on pages: pictures, and the publisher's own video / audio / picture files, shown as an icon or on the page itself
ALTER TABLE page_hotspots DROP CONSTRAINT IF EXISTS page_hotspots_kind_check;--> statement-breakpoint
ALTER TABLE page_hotspots ADD CONSTRAINT page_hotspots_kind_check CHECK (kind IN ('NOTE', 'AUDIO', 'VIDEO', 'LINK', 'GAME', 'IMAGE'));--> statement-breakpoint
ALTER TABLE page_hotspots ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES digital_assets(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE page_hotspots ADD COLUMN IF NOT EXISTS inline boolean NOT NULL DEFAULT false;
