-- Camera games: hands in front of the camera (tracked on the device), or a finger on the screen.
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'BUBBLE_POP';--> statement-breakpoint
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'FINGERS';--> statement-breakpoint
ALTER TYPE game_engine ADD VALUE IF NOT EXISTS 'AIR_WRITING';
