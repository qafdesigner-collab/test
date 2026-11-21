-- An assignment can point at the book page it is about, so students can open that page next to the questions.
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS book_component_id uuid REFERENCES book_components(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS book_page int CHECK (book_page IS NULL OR book_page BETWEEN 1 AND 5000);
