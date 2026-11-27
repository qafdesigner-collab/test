-- Who sees a book part, unit or lesson: ALL (teachers and students), TEACHER (hidden from students) or STUDENT (hidden from teachers).
-- Publisher staff and school admins always see everything.
ALTER TABLE book_components ADD COLUMN IF NOT EXISTS visible_to audience NOT NULL DEFAULT 'ALL';
--> statement-breakpoint
ALTER TABLE book_units ADD COLUMN IF NOT EXISTS visible_to audience NOT NULL DEFAULT 'ALL';
--> statement-breakpoint
ALTER TABLE book_lessons ADD COLUMN IF NOT EXISTS visible_to audience NOT NULL DEFAULT 'ALL';
--> statement-breakpoint
-- teacher guides and teacher cards were never meant for students
UPDATE book_components SET visible_to = 'TEACHER' WHERE type IN ('TEACHER_GUIDE', 'TEACHER_CARDS') AND visible_to = 'ALL';
