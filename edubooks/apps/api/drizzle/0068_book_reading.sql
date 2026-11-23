-- Book pages: a "Read aloud" element — the student records the reading and sends it to the teacher.
ALTER TABLE page_hotspots DROP CONSTRAINT IF EXISTS page_hotspots_kind_check;--> statement-breakpoint
ALTER TABLE page_hotspots ADD CONSTRAINT page_hotspots_kind_check CHECK (kind IN ('NOTE','AUDIO','VIDEO','LINK','GAME','IMAGE','TRACE','DRAW','READ'));--> statement-breakpoint
ALTER TABLE page_work ALTER COLUMN image DROP NOT NULL;--> statement-breakpoint
ALTER TABLE page_work ADD COLUMN IF NOT EXISTS audio_id uuid REFERENCES audio_clips(id) ON DELETE SET NULL;--> statement-breakpoint
-- the teacher's answer: well done, or please do it again (with stars and a comment)
ALTER TABLE page_work ADD COLUMN IF NOT EXISTS verdict text CHECK (verdict IN ('OK','REDO'));--> statement-breakpoint
ALTER TABLE page_work DROP CONSTRAINT IF EXISTS page_work_kind_check;--> statement-breakpoint
ALTER TABLE page_work ADD CONSTRAINT page_work_kind_check CHECK (kind IN ('TRACE','DRAW','READ'));--> statement-breakpoint
ALTER TABLE page_work DROP CONSTRAINT IF EXISTS page_work_content_check;--> statement-breakpoint
ALTER TABLE page_work ADD CONSTRAINT page_work_content_check CHECK (image IS NOT NULL OR audio_id IS NOT NULL OR kind = 'READ');
