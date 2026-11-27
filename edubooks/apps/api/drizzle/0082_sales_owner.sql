-- The salesperson a school belongs to. A sales login sees only its own schools (plus its demo school and schools it created).
ALTER TABLE schools ADD COLUMN IF NOT EXISTS sales_owner_id uuid REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schools_sales_owner_idx ON schools (sales_owner_id);
