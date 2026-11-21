CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."audience" AS ENUM('TEACHER', 'STUDENT', 'ALL');--> statement-breakpoint
CREATE TYPE "public"."component_type" AS ENUM('STUDENT_BOOK', 'HOMEWORK_BOOK', 'WORKBOOK', 'TEACHER_GUIDE', 'FLASHCARDS', 'TEACHER_CARDS', 'DANGLERS', 'POSTERS', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('PDF', 'PRESENTATION', 'DOCUMENT', 'SPREADSHEET', 'HTML5', 'IMAGE', 'AUDIO', 'VIDEO', 'FLASHCARD', 'TEACHER_CARD', 'DANGLER', 'POSTER', 'WORKSHEET', 'GAME', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('PENDING', 'CLEAN', 'SKIPPED', 'INFECTED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"type" "component_type" NOT NULL,
	"title" text NOT NULL,
	"part_number" integer,
	"description" text DEFAULT '' NOT NULL,
	"book_asset_id" uuid,
	"page_count" integer,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"label" text NOT NULL,
	"edition_year" integer NOT NULL,
	"status" "content_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"cloned_from_id" uuid,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"objectives" text DEFAULT '' NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lessons_pages_ck" CHECK ("book_lessons"."page_start" IS NULL OR "book_lessons"."page_end" IS NULL OR "book_lessons"."page_end" >= "book_lessons"."page_start")
);
--> statement-breakpoint
CREATE TABLE "book_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"grade_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" "citext" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cover_color" text DEFAULT '#f97316' NOT NULL,
	"status" "content_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"lesson_id" uuid,
	"page_number" integer NOT NULL,
	"text_content" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"ext" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"scan_status" "scan_status" DEFAULT 'PENDING' NOT NULL,
	"scanned_at" timestamp with time zone,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"name" "citext" NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publishers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publishers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" "citext" NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"city" text,
	"address" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"name" "citext" NOT NULL,
	"color" text DEFAULT '#4f46e5' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"component_id" uuid,
	"unit_id" uuid,
	"lesson_id" uuid,
	"asset_id" uuid NOT NULL,
	"title" text NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"audience" "audience" DEFAULT 'TEACHER' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_scope_ck" CHECK (("teaching_resources"."lesson_id" IS NULL OR "teaching_resources"."unit_id" IS NOT NULL) AND ("teaching_resources"."unit_id" IS NULL OR "teaching_resources"."component_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid,
	"username" "citext" NOT NULL,
	"display_name" text NOT NULL,
	"email" "citext",
	"password_hash" text NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_components" ADD CONSTRAINT "book_components_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_components" ADD CONSTRAINT "book_components_edition_id_book_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."book_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_components" ADD CONSTRAINT "book_components_book_asset_id_digital_assets_id_fk" FOREIGN KEY ("book_asset_id") REFERENCES "public"."digital_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_package_id_book_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."book_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_lessons" ADD CONSTRAINT "book_lessons_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_lessons" ADD CONSTRAINT "book_lessons_unit_id_book_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."book_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_packages" ADD CONSTRAINT "book_packages_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_packages" ADD CONSTRAINT "book_packages_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_packages" ADD CONSTRAINT "book_packages_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_packages" ADD CONSTRAINT "book_packages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_pages" ADD CONSTRAINT "book_pages_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_pages" ADD CONSTRAINT "book_pages_component_id_book_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."book_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_pages" ADD CONSTRAINT "book_pages_lesson_id_book_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."book_lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_units" ADD CONSTRAINT "book_units_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_units" ADD CONSTRAINT "book_units_component_id_book_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."book_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_assets" ADD CONSTRAINT "digital_assets_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_assets" ADD CONSTRAINT "digital_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resources" ADD CONSTRAINT "teaching_resources_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resources" ADD CONSTRAINT "teaching_resources_edition_id_book_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."book_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resources" ADD CONSTRAINT "teaching_resources_component_id_book_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."book_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resources" ADD CONSTRAINT "teaching_resources_unit_id_book_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."book_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resources" ADD CONSTRAINT "teaching_resources_lesson_id_book_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."book_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resources" ADD CONSTRAINT "teaching_resources_asset_id_digital_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."digital_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_resources" ADD CONSTRAINT "teaching_resources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_publisher_time_idx" ON "audit_logs" USING btree ("publisher_id","created_at");--> statement-breakpoint
CREATE INDEX "components_edition_idx" ON "book_components" USING btree ("edition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "editions_label_uq" ON "book_editions" USING btree ("package_id","label");--> statement-breakpoint
CREATE INDEX "editions_package_idx" ON "book_editions" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "lessons_unit_idx" ON "book_lessons" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "packages_slug_uq" ON "book_packages" USING btree ("publisher_id","slug");--> statement-breakpoint
CREATE INDEX "packages_filter_idx" ON "book_packages" USING btree ("publisher_id","grade_id","subject_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_component_page_uq" ON "book_pages" USING btree ("component_id","page_number");--> statement-breakpoint
CREATE INDEX "units_component_idx" ON "book_units" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_sha_uq" ON "digital_assets" USING btree ("publisher_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "grades_name_uq" ON "grades" USING btree ("publisher_id","name");--> statement-breakpoint
CREATE INDEX "schools_publisher_idx" ON "schools" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_name_uq" ON "subjects" USING btree ("publisher_id","name");--> statement-breakpoint
CREATE INDEX "resources_edition_idx" ON "teaching_resources" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "resources_asset_idx" ON "teaching_resources" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_school_username_uq" ON "users" USING btree ("school_id","username") WHERE "users"."school_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_staff_username_uq" ON "users" USING btree ("publisher_id","username") WHERE "users"."school_id" IS NULL;--> statement-breakpoint
CREATE INDEX "users_publisher_idx" ON "users" USING btree ("publisher_id");