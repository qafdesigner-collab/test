CREATE TYPE "public"."adjustment_kind" AS ENUM('COMPLIMENTARY', 'TRIAL', 'CORRECTION');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED', 'TRANSFERRED', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('NEW', 'RENEWAL', 'ADDITIONAL');--> statement-breakpoint
CREATE TYPE "public"."pool_status" AS ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('SINGLE', 'BUNDLE');--> statement-breakpoint
CREATE TYPE "public"."seat_status" AS ENUM('AVAILABLE', 'ASSIGNED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."seat_type" AS ENUM('STUDENT', 'TEACHER');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('DRAFT', 'ACTIVE', 'RETIRED');--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" timestamp with time zone NOT NULL,
	"ends_on" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ay_dates_ck" CHECK ("academic_years"."ends_on" > "academic_years"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "access_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bundle_items" (
	"product_version_id" uuid NOT NULL,
	"edition_id" uuid NOT NULL,
	"publisher_id" uuid NOT NULL,
	CONSTRAINT "bundle_items_product_version_id_edition_id_pk" PRIMARY KEY("product_version_id","edition_id")
);
--> statement-breakpoint
CREATE TABLE "fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"fulfilled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillments_order_line_id_unique" UNIQUE("order_line_id")
);
--> statement-breakpoint
CREATE TABLE "license_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"product_version_id" uuid NOT NULL,
	"seat_type" "seat_type" NOT NULL,
	"quantity" integer NOT NULL,
	"kind" "adjustment_kind" NOT NULL,
	"reason" text NOT NULL,
	"valid_until" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adj_qty_ck" CHECK ("license_adjustments"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "license_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "assignment_status" DEFAULT 'ACTIVE' NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"transferred_from_id" uuid
);
--> statement-breakpoint
CREATE TABLE "license_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"product_version_id" uuid NOT NULL,
	"seat_type" "seat_type" NOT NULL,
	"quantity" integer NOT NULL,
	"fulfillment_id" uuid,
	"adjustment_id" uuid,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"status" "pool_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_source_ck" CHECK (("license_pools"."fulfillment_id" IS NOT NULL) <> ("license_pools"."adjustment_id" IS NOT NULL)),
	CONSTRAINT "pool_qty_ck" CHECK ("license_pools"."quantity" > 0),
	CONSTRAINT "pool_dates_ck" CHECK ("license_pools"."valid_until" > "license_pools"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "license_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"seat_no" integer NOT NULL,
	"status" "seat_status" DEFAULT 'AVAILABLE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "transfer_status" DEFAULT 'PENDING' NOT NULL,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"new_assignment_id" uuid
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_version_id" uuid NOT NULL,
	"student_qty" integer DEFAULT 0 NOT NULL,
	"teacher_qty" integer DEFAULT 0 NOT NULL,
	"unit_price_minor" bigint,
	CONSTRAINT "ol_qty_ck" CHECK ("order_lines"."student_qty" >= 0 AND "order_lines"."teacher_qty" >= 0 AND "order_lines"."student_qty" + "order_lines"."teacher_qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"order_no" text NOT NULL,
	"type" "order_type" DEFAULT 'NEW' NOT NULL,
	"status" "order_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"confirmed_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" "version_status" DEFAULT 'DRAFT' NOT NULL,
	"price_minor" bigint,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"sku" "citext" NOT NULL,
	"name" text NOT NULL,
	"kind" "product_kind" NOT NULL,
	"grade_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "demo_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_edition_id_book_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."book_editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD CONSTRAINT "access_entitlements_assignment_id_license_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."license_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_product_version_id_product_versions_id_fk" FOREIGN KEY ("product_version_id") REFERENCES "public"."product_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_edition_id_book_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."book_editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_fulfilled_by_users_id_fk" FOREIGN KEY ("fulfilled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_adjustments" ADD CONSTRAINT "license_adjustments_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_adjustments" ADD CONSTRAINT "license_adjustments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_adjustments" ADD CONSTRAINT "license_adjustments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_adjustments" ADD CONSTRAINT "license_adjustments_product_version_id_product_versions_id_fk" FOREIGN KEY ("product_version_id") REFERENCES "public"."product_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_adjustments" ADD CONSTRAINT "license_adjustments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_pool_id_license_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."license_pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_seat_id_license_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."license_seats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_product_version_id_product_versions_id_fk" FOREIGN KEY ("product_version_id") REFERENCES "public"."product_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_fulfillment_id_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."fulfillments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_pools" ADD CONSTRAINT "license_pools_adjustment_id_license_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."license_adjustments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seats_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seats_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seats_pool_id_license_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."license_pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_transfers" ADD CONSTRAINT "license_transfers_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_transfers" ADD CONSTRAINT "license_transfers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_transfers" ADD CONSTRAINT "license_transfers_assignment_id_license_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."license_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_transfers" ADD CONSTRAINT "license_transfers_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_transfers" ADD CONSTRAINT "license_transfers_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_transfers" ADD CONSTRAINT "license_transfers_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_transfers" ADD CONSTRAINT "license_transfers_new_assignment_id_license_assignments_id_fk" FOREIGN KEY ("new_assignment_id") REFERENCES "public"."license_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_version_id_product_versions_id_fk" FOREIGN KEY ("product_version_id") REFERENCES "public"."product_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ay_school_name_uq" ON "academic_years" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "ent_assign_edition_uq" ON "access_entitlements" USING btree ("assignment_id","edition_id");--> statement-breakpoint
CREATE INDEX "ent_user_idx" ON "access_entitlements" USING btree ("user_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "assign_seat_live_uq" ON "license_assignments" USING btree ("seat_id") WHERE "license_assignments"."status" IN ('ACTIVE','SUSPENDED');--> statement-breakpoint
CREATE UNIQUE INDEX "assign_pool_user_live_uq" ON "license_assignments" USING btree ("pool_id","user_id") WHERE "license_assignments"."status" IN ('ACTIVE','SUSPENDED');--> statement-breakpoint
CREATE INDEX "assign_user_idx" ON "license_assignments" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "pools_school_idx" ON "license_pools" USING btree ("school_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "seats_pool_no_uq" ON "license_seats" USING btree ("pool_id","seat_no");--> statement-breakpoint
CREATE INDEX "seats_pool_status_idx" ON "license_seats" USING btree ("pool_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_pending_uq" ON "license_transfers" USING btree ("assignment_id") WHERE "license_transfers"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "orders_no_uq" ON "orders" USING btree ("publisher_id","order_no");--> statement-breakpoint
CREATE INDEX "orders_school_idx" ON "orders" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pv_product_version_uq" ON "product_versions" USING btree ("product_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "pv_one_active_uq" ON "product_versions" USING btree ("product_id") WHERE "product_versions"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_uq" ON "products" USING btree ("publisher_id","sku");