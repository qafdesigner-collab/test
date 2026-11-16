-- A CD or flipbook part can hold several units, each uploaded on its own (e.g. one SWF per unit).
-- The part's main upload keeps unit_title NULL; units have a title and an order.
ALTER TABLE flipbooks ADD COLUMN IF NOT EXISTS unit_title text CHECK (unit_title IS NULL OR length(unit_title) BETWEEN 1 AND 120);--> statement-breakpoint
ALTER TABLE flipbooks ADD COLUMN IF NOT EXISTS sort int NOT NULL DEFAULT 0;--> statement-breakpoint
DROP INDEX IF EXISTS flipbooks_component_uq;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS flipbooks_component_main_uq ON flipbooks (component_id) WHERE unit_title IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS flipbooks_component_idx ON flipbooks (component_id, sort);
