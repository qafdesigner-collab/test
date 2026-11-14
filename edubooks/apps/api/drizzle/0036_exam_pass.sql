-- Pass mark per exam (percentage), for pass/fail on result sheets.
ALTER TABLE exams ADD COLUMN IF NOT EXISTS pass_percent int NOT NULL DEFAULT 40 CHECK (pass_percent BETWEEN 0 AND 100);
