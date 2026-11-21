CREATE TYPE "public"."game_engine" AS ENUM('ALPHABET_MATCH', 'PICTURE_WORD', 'COUNTING', 'SORTING', 'MEMORY', 'FILL_BLANK', 'QUIZ', 'SHAPES', 'WORD_BUILD', 'PUZZLE');--> statement-breakpoint
CREATE TABLE "game_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid,
	"edition_id" uuid,
	"lesson_id" uuid,
	"engine" "game_engine" NOT NULL,
	"title" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_difficulty_ck" CHECK ("game_activities"."difficulty" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "game_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"assignment_id" uuid,
	"score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"stars" integer NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_score_ck" CHECK ("game_attempts"."score" >= 0 AND "game_attempts"."score" <= "game_attempts"."max_score" AND "game_attempts"."stars" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "student_badges" (
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"badge" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_badges_student_id_badge_pk" PRIMARY KEY("student_id","badge")
);
--> statement-breakpoint
ALTER TABLE "game_activities" ADD CONSTRAINT "game_activities_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_activities" ADD CONSTRAINT "game_activities_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_activities" ADD CONSTRAINT "game_activities_edition_id_book_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."book_editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_activities" ADD CONSTRAINT "game_activities_lesson_id_book_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."book_lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_activities" ADD CONSTRAINT "game_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_assignments" ADD CONSTRAINT "game_assignments_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_assignments" ADD CONSTRAINT "game_assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_assignments" ADD CONSTRAINT "game_assignments_activity_id_game_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."game_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_assignments" ADD CONSTRAINT "game_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_assignments" ADD CONSTRAINT "game_assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD CONSTRAINT "game_attempts_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD CONSTRAINT "game_attempts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD CONSTRAINT "game_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD CONSTRAINT "game_attempts_activity_id_game_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."game_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_attempts" ADD CONSTRAINT "game_attempts_assignment_id_game_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."game_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_edition_idx" ON "game_activities" USING btree ("edition_id","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_assign_uq" ON "game_assignments" USING btree ("activity_id","class_id");--> statement-breakpoint
CREATE INDEX "attempts_student_idx" ON "game_attempts" USING btree ("student_id","activity_id");