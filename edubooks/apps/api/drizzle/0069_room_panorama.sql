-- The room scan of a watched test: one panorama picture and a short video of the scan.
ALTER TABLE proctor_events DROP CONSTRAINT IF EXISTS proctor_events_kind_check;--> statement-breakpoint
ALTER TABLE proctor_events ADD CONSTRAINT proctor_events_kind_check CHECK (kind IN ('ROOM','PANORAMA','ROOM_VIDEO','CAMERA','SCREEN','AWAY','SCREEN_OFF','CAMERA_OFF','SCREEN_PART','NO_SCREEN','NO_CAMERA','FULLSCREEN_OFF'));
