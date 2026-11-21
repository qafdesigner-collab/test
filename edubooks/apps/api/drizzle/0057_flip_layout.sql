-- How a flipbook pairs its pages: COVER (page 1 alone on the right, odd pages on the right), PAIRS (1–2, 3–4…), SINGLE (one page at a time)
ALTER TABLE book_components ADD COLUMN IF NOT EXISTS flip_layout text NOT NULL DEFAULT 'COVER';--> statement-breakpoint
ALTER TABLE book_components DROP CONSTRAINT IF EXISTS book_components_flip_layout_ck;--> statement-breakpoint
ALTER TABLE book_components ADD CONSTRAINT book_components_flip_layout_ck CHECK (flip_layout IN ('COVER', 'PAIRS', 'SINGLE'));
