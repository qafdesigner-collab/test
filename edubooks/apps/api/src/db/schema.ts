// Drizzle schema — Phase 1 (foundation) + Phase 2 (publishing).
// Every tenant-owned row carries publisher_id (and school_id where school-private) so that
// PostgreSQL Row-Level Security policies (see drizzle/*_rls.sql) stay simple and indexable.
import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, date as pgDate, uuid, text, integer, bigint, boolean, timestamp, jsonb, customType, index, uniqueIndex, primaryKey, check,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ---------- enums ----------
export const roleEnum = pgEnum('role', ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT']);
export const accountStatusEnum = pgEnum('account_status', ['ACTIVE', 'SUSPENDED', 'DISABLED']);
export const contentStatusEnum = pgEnum('content_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const componentTypeEnum = pgEnum('component_type', [
  'STUDENT_BOOK', 'HOMEWORK_BOOK', 'WORKBOOK', 'TEACHER_GUIDE', 'FLASHCARDS', 'TEACHER_CARDS', 'DANGLERS', 'POSTERS', 'OTHER',
]);
export const resourceTypeEnum = pgEnum('resource_type', [
  'PDF', 'PRESENTATION', 'DOCUMENT', 'SPREADSHEET', 'HTML5', 'IMAGE', 'AUDIO', 'VIDEO',
  'FLASHCARD', 'TEACHER_CARD', 'DANGLER', 'POSTER', 'WORKSHEET', 'GAME', 'OTHER',
]);
export const audienceEnum = pgEnum('audience', ['TEACHER', 'STUDENT', 'ALL']);
export const scanStatusEnum = pgEnum('scan_status', ['PENDING', 'CLEAN', 'SKIPPED', 'INFECTED']);

// ---------- tenancy & identity ----------
export const publishers = pgTable('publishers', {
  id: id(),
  name: text('name').notNull(),
  slug: citext('slug').notNull().unique(),
  settings: jsonb('settings').notNull().default({}),
  createdAt: createdAt(),
});

export const schools = pgTable('schools', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  code: citext('code').notNull().unique(),
  status: accountStatusEnum('status').notNull().default('ACTIVE'),
  city: text('city'),
  address: text('address'),
  phone: text('phone'),
  isDemo: boolean('is_demo').notNull().default(false),
  notifySettings: jsonb('notify_settings').notNull().default({}),
  curriculumId: uuid('curriculum_id'), // FK to curricula (declared in SQL; curricula is defined further down)
  demoExpiresAt: timestamp('demo_expires_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('schools_publisher_idx').on(t.publisherId)]);

export const users = pgTable('users', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id, { onDelete: 'restrict' }),
  // Home tenant. NULL = publisher staff. A student has exactly one account per school.
  schoolId: uuid('school_id').references(() => schools.id, { onDelete: 'cascade' }),
  username: citext('username').notNull(),
  displayName: text('display_name').notNull(),
  email: citext('email'),
  phone: text('phone'),
  passwordHash: text('password_hash').notNull(),
  status: accountStatusEnum('status').notNull().default('ACTIVE'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('users_school_username_uq').on(t.schoolId, t.username).where(sql`${t.schoolId} IS NOT NULL`),
  uniqueIndex('users_staff_username_uq').on(t.publisherId, t.username).where(sql`${t.schoolId} IS NULL`),
  index('users_publisher_idx').on(t.publisherId),
]);

export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').references(() => schools.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.userId, t.role] })]);

export const sessions = pgTable('sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: bytea('token_hash').notNull().unique(),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ip: text('ip'),
  userAgent: text('user_agent'),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id'),
  actorUserId: uuid('actor_user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  summary: text('summary').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [
  index('audit_entity_idx').on(t.entityType, t.entityId),
  index('audit_publisher_time_idx').on(t.publisherId, t.createdAt),
]);

// ---------- catalog taxonomy ----------
/** Education systems (American, British, Cambridge, IB, MOE, CBC, Pakistan, Other); filled by seed_reference_data(). */
export const curricula = pgTable('curricula', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  code: citext('code').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull().default('#4f46e5'),
  sort: integer('sort').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('curricula_code_uq').on(t.publisherId, t.code)]);

export const grades = pgTable('grades', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  // NOT NULL in the database; a trigger puts grades created without one into the "Other" curriculum.
  curriculumId: uuid('curriculum_id').references(() => curricula.id, { onDelete: 'restrict' }),
  stage: text('stage').notNull().default(''),
  name: citext('name').notNull(),
  sort: integer('sort').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('grades_name_uq').on(t.publisherId, t.curriculumId, t.name)]);

export const subjects = pgTable('subjects', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  name: citext('name').notNull(),
  color: text('color').notNull().default('#4f46e5'),
  sort: integer('sort').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('subjects_name_uq').on(t.publisherId, t.name)]);

// ---------- digital assets (content-addressed, deduplicated) ----------
export const digitalAssets = pgTable('digital_assets', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  sha256: text('sha256').notNull(),
  storageKey: text('storage_key').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  ext: text('ext').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  scanStatus: scanStatusEnum('scan_status').notNull().default('PENDING'),
  scannedAt: timestamp('scanned_at', { withTimezone: true }),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('assets_sha_uq').on(t.publisherId, t.sha256)]);

// ---------- publishing hierarchy: Package → Edition → Component → Unit → Lesson (→ Pages) ----------
export const bookPackages = pgTable('book_packages', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  gradeId: uuid('grade_id').notNull().references(() => grades.id, { onDelete: 'restrict' }),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  slug: citext('slug').notNull(),
  description: text('description').notNull().default(''),
  coverColor: text('cover_color').notNull().default('#f97316'),
  status: contentStatusEnum('status').notNull().default('DRAFT'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('packages_slug_uq').on(t.publisherId, t.slug),
  index('packages_filter_idx').on(t.publisherId, t.gradeId, t.subjectId, t.status),
]);

export const bookEditions = pgTable('book_editions', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  packageId: uuid('package_id').notNull().references(() => bookPackages.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  editionYear: integer('edition_year').notNull(),
  status: contentStatusEnum('status').notNull().default('DRAFT'),
  notes: text('notes').notNull().default(''),
  clonedFromId: uuid('cloned_from_id'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('editions_label_uq').on(t.packageId, t.label), index('editions_package_idx').on(t.packageId)]);

export const bookComponents = pgTable('book_components', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  editionId: uuid('edition_id').notNull().references(() => bookEditions.id, { onDelete: 'cascade' }),
  type: componentTypeEnum('type').notNull(),
  title: text('title').notNull(),
  partNumber: integer('part_number'),
  description: text('description').notNull().default(''),
  bookAssetId: uuid('book_asset_id').references(() => digitalAssets.id, { onDelete: 'set null' }),
  pageCount: integer('page_count'),
  sort: integer('sort').notNull().default(0),
  // AI text index of the book PDF (Phase 5): NONE | RUNNING | DONE | NO_TEXT | ERROR
  indexStatus: text('index_status').notNull().default('NONE'),
  indexedPages: integer('indexed_pages').notNull().default(0),
  indexedAt: timestamp('indexed_at', { withTimezone: true }),
  indexError: text('index_error'),
}, (t) => [index('components_edition_idx').on(t.editionId)]);

export const bookUnits = pgTable('book_units', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  componentId: uuid('component_id').notNull().references(() => bookComponents.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  sort: integer('sort').notNull().default(0),
}, (t) => [index('units_component_idx').on(t.componentId)]);

export const bookLessons = pgTable('book_lessons', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  unitId: uuid('unit_id').notNull().references(() => bookUnits.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  objectives: text('objectives').notNull().default(''),
  pageStart: integer('page_start'),
  pageEnd: integer('page_end'),
  sort: integer('sort').notNull().default(0),
}, (t) => [
  index('lessons_unit_idx').on(t.unitId),
  check('lessons_pages_ck', sql`${t.pageStart} IS NULL OR ${t.pageEnd} IS NULL OR ${t.pageEnd} >= ${t.pageStart}`),
]);

// Page text (filled by the Phase 5 PDF indexer; embeddings column added then).
export const bookPages = pgTable('book_pages', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  componentId: uuid('component_id').notNull().references(() => bookComponents.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').references(() => bookLessons.id, { onDelete: 'set null' }),
  pageNumber: integer('page_number').notNull(),
  textContent: text('text_content').notNull().default(''),
}, (t) => [uniqueIndex('pages_component_page_uq').on(t.componentId, t.pageNumber)]);

export const teachingResources = pgTable('teaching_resources', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  editionId: uuid('edition_id').notNull().references(() => bookEditions.id, { onDelete: 'cascade' }),
  // Narrowest scope wins: lesson ⊂ unit ⊂ component ⊂ edition. All NULL = whole book.
  componentId: uuid('component_id').references(() => bookComponents.id, { onDelete: 'cascade' }),
  unitId: uuid('unit_id').references(() => bookUnits.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').references(() => bookLessons.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').notNull().references(() => digitalAssets.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  resourceType: resourceTypeEnum('resource_type').notNull(),
  audience: audienceEnum('audience').notNull().default('TEACHER'),
  sort: integer('sort').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [
  index('resources_edition_idx').on(t.editionId),
  index('resources_asset_idx').on(t.assetId),
  check('resources_scope_ck', sql`(${t.lessonId} IS NULL OR ${t.unitId} IS NOT NULL) AND (${t.unitId} IS NULL OR ${t.componentId} IS NOT NULL)`),
]);

// =====================================================================================
// Phase 2b/3 — commerce & licensing
// =====================================================================================
export const productKindEnum = pgEnum('product_kind', ['SINGLE', 'BUNDLE']);
export const versionStatusEnum = pgEnum('version_status', ['DRAFT', 'ACTIVE', 'RETIRED']);
export const orderTypeEnum = pgEnum('order_type', ['NEW', 'RENEWAL', 'ADDITIONAL']);
export const orderStatusEnum = pgEnum('order_status', ['DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED']);
export const seatTypeEnum = pgEnum('seat_type', ['STUDENT', 'TEACHER']);
export const poolStatusEnum = pgEnum('pool_status', ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED']);
export const seatStatusEnum = pgEnum('seat_status', ['AVAILABLE', 'ASSIGNED', 'REVOKED']);
export const assignmentStatusEnum = pgEnum('assignment_status', ['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED', 'TRANSFERRED', 'RELEASED']);
export const transferStatusEnum = pgEnum('transfer_status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
export const adjustmentKindEnum = pgEnum('adjustment_kind', ['COMPLIMENTARY', 'TRIAL', 'CORRECTION']);
const date = (n: string) => timestamp(n, { withTimezone: true });

export const calendarKindEnum = pgEnum('calendar_kind', ['TERM', 'HOLIDAY', 'EXAM', 'EVENT', 'MEETING', 'SPORTS', 'OTHER']);
/** Academic calendar. school_id NULL = publisher event (all schools, or only schools following curriculum_id). */
export const calendarEvents = pgTable('calendar_events', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').references(() => schools.id, { onDelete: 'cascade' }),
  curriculumId: uuid('curriculum_id').references(() => curricula.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  kind: calendarKindEnum('kind').notNull().default('EVENT'),
  // Plain calendar dates ('YYYY-MM-DD'), no time zone.
  startsOn: pgDate('starts_on', { mode: 'string' }).notNull(),
  endsOn: pgDate('ends_on', { mode: 'string' }).notNull(),
  description: text('description').notNull().default(''),
  isTemplate: boolean('is_template').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('calendar_range_idx').on(t.publisherId, t.startsOn, t.endsOn)]);

export const academicYears = pgTable('academic_years', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('ay_school_name_uq').on(t.schoolId, t.name), check('ay_dates_ck', sql`${t.endsOn} > ${t.startsOn}`)]);

export const products = pgTable('products', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  sku: citext('sku').notNull(),
  name: text('name').notNull(),
  kind: productKindEnum('kind').notNull(),
  gradeId: uuid('grade_id').references(() => grades.id, { onDelete: 'set null' }),
  description: text('description').notNull().default(''),
  archived: boolean('archived').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('products_sku_uq').on(t.publisherId, t.sku)]);

/** Immutable once ACTIVE (enforced by a DB trigger): orders always point at a frozen version. */
export const productVersions = pgTable('product_versions', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  versionNo: integer('version_no').notNull(),
  status: versionStatusEnum('status').notNull().default('DRAFT'),
  priceMinor: bigint('price_minor', { mode: 'number' }),
  currency: text('currency').notNull().default('PKR'),
  notes: text('notes').notNull().default(''),
  activatedAt: date('activated_at'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('pv_product_version_uq').on(t.productId, t.versionNo),
  uniqueIndex('pv_one_active_uq').on(t.productId).where(sql`${t.status} = 'ACTIVE'`),
]);

export const bundleItems = pgTable('bundle_items', {
  productVersionId: uuid('product_version_id').notNull().references(() => productVersions.id, { onDelete: 'cascade' }),
  editionId: uuid('edition_id').notNull().references(() => bookEditions.id, { onDelete: 'restrict' }),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
}, (t) => [primaryKey({ columns: [t.productVersionId, t.editionId] })]);

export const orders = pgTable('orders', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'restrict' }),
  orderNo: text('order_no').notNull(),
  type: orderTypeEnum('type').notNull().default('NEW'),
  status: orderStatusEnum('status').notNull().default('DRAFT'),
  notes: text('notes').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  confirmedAt: date('confirmed_at'),
  fulfilledAt: date('fulfilled_at'),
  cancelledAt: date('cancelled_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('orders_no_uq').on(t.publisherId, t.orderNo), index('orders_school_idx').on(t.schoolId)]);

export const orderLines = pgTable('order_lines', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productVersionId: uuid('product_version_id').notNull().references(() => productVersions.id, { onDelete: 'restrict' }),
  studentQty: integer('student_qty').notNull().default(0),
  teacherQty: integer('teacher_qty').notNull().default(0),
  unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }),
}, (t) => [check('ol_qty_ck', sql`${t.studentQty} >= 0 AND ${t.teacherQty} >= 0 AND ${t.studentQty} + ${t.teacherQty} > 0`)]);

export const fulfillments = pgTable('fulfillments', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  orderLineId: uuid('order_line_id').notNull().unique().references(() => orderLines.id, { onDelete: 'restrict' }),
  fulfilledBy: uuid('fulfilled_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const licenseAdjustments = pgTable('license_adjustments', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'restrict' }),
  productVersionId: uuid('product_version_id').notNull().references(() => productVersions.id, { onDelete: 'restrict' }),
  seatType: seatTypeEnum('seat_type').notNull(),
  quantity: integer('quantity').notNull(),
  kind: adjustmentKindEnum('kind').notNull(),
  reason: text('reason').notNull(),
  validUntil: date('valid_until'),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [check('adj_qty_ck', sql`${t.quantity} > 0`)]);

export const licensePools = pgTable('license_pools', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'restrict' }),
  productVersionId: uuid('product_version_id').notNull().references(() => productVersions.id, { onDelete: 'restrict' }),
  seatType: seatTypeEnum('seat_type').notNull(),
  quantity: integer('quantity').notNull(),
  fulfillmentId: uuid('fulfillment_id').references(() => fulfillments.id, { onDelete: 'restrict' }),
  adjustmentId: uuid('adjustment_id').references(() => licenseAdjustments.id, { onDelete: 'restrict' }),
  validFrom: date('valid_from').notNull(),
  validUntil: date('valid_until').notNull(),
  status: poolStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: createdAt(),
}, (t) => [
  check('pool_source_ck', sql`(${t.fulfillmentId} IS NOT NULL) <> (${t.adjustmentId} IS NOT NULL)`),
  check('pool_qty_ck', sql`${t.quantity} > 0`),
  check('pool_dates_ck', sql`${t.validUntil} > ${t.validFrom}`),
  index('pools_school_idx').on(t.schoolId, t.status),
]);

export const licenseSeats = pgTable('license_seats', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  poolId: uuid('pool_id').notNull().references(() => licensePools.id, { onDelete: 'restrict' }),
  seatNo: integer('seat_no').notNull(),
  status: seatStatusEnum('status').notNull().default('AVAILABLE'),
}, (t) => [uniqueIndex('seats_pool_no_uq').on(t.poolId, t.seatNo), index('seats_pool_status_idx').on(t.poolId, t.status)]);

export const licenseAssignments = pgTable('license_assignments', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  poolId: uuid('pool_id').notNull().references(() => licensePools.id, { onDelete: 'restrict' }),
  seatId: uuid('seat_id').notNull().references(() => licenseSeats.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: assignmentStatusEnum('status').notNull().default('ACTIVE'),
  assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  assignedAt: createdAt(),
  endedAt: date('ended_at'),
  endReason: text('end_reason'),
  transferredFromId: uuid('transferred_from_id'),
}, (t) => [
  // A seat can be held by only one person at a time; a person holds at most one seat per pool.
  uniqueIndex('assign_seat_live_uq').on(t.seatId).where(sql`${t.status} IN ('ACTIVE','SUSPENDED')`),
  uniqueIndex('assign_pool_user_live_uq').on(t.poolId, t.userId).where(sql`${t.status} IN ('ACTIVE','SUSPENDED')`),
  index('assign_user_idx').on(t.userId, t.status),
]);

export const licenseTransfers = pgTable('license_transfers', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  assignmentId: uuid('assignment_id').notNull().references(() => licenseAssignments.id, { onDelete: 'restrict' }),
  toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  status: transferStatusEnum('status').notNull().default('PENDING'),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  requestedAt: createdAt(),
  decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: date('decided_at'),
  decisionNote: text('decision_note'),
  newAssignmentId: uuid('new_assignment_id').references(() => licenseAssignments.id),
}, (t) => [uniqueIndex('transfer_pending_uq').on(t.assignmentId).where(sql`${t.status} = 'PENDING'`)]);

export const accessEntitlements = pgTable('access_entitlements', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  editionId: uuid('edition_id').notNull().references(() => bookEditions.id, { onDelete: 'restrict' }),
  assignmentId: uuid('assignment_id').notNull().references(() => licenseAssignments.id, { onDelete: 'cascade' }),
  validUntil: date('valid_until').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('ent_assign_edition_uq').on(t.assignmentId, t.editionId), index('ent_user_idx').on(t.userId, t.active)]);

// =====================================================================================
// Phase 4 — classes, reader, lesson plans, assessments
// =====================================================================================
export const assessmentKindEnum = pgEnum('assessment_kind', ['HOMEWORK', 'QUIZ', 'TEST']);
export const assessmentStatusEnum = pgEnum('assessment_status', ['DRAFT', 'PUBLISHED', 'CLOSED']);
export const questionTypeEnum = pgEnum('question_type', ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT']);
export const submissionStatusEnum = pgEnum('submission_status', ['SUBMITTED', 'GRADED', 'RETURNED']);
export const planStatusEnum = pgEnum('plan_status', ['DRAFT', 'READY']);
const schoolCols = () => ({
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
});

export const classes = pgTable('classes', {
  id: id(), ...schoolCols(),
  academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'restrict' }),
  gradeId: uuid('grade_id').references(() => grades.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  section: text('section').notNull().default(''),
  archived: boolean('archived').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('classes_name_uq').on(t.schoolId, t.academicYearId, t.name, t.section)]);

export const classTeachers = pgTable('class_teachers', {
  classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ...schoolCols(),
  subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
}, (t) => [primaryKey({ columns: [t.classId, t.userId] })]);

export const enrolments = pgTable('enrolments', {
  classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ...schoolCols(),
  academicYearId: uuid('academic_year_id').notNull().references(() => academicYears.id),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.classId, t.studentId] }),
  // A student belongs to one class per academic year.
  uniqueIndex('enrol_one_class_per_year_uq').on(t.studentId, t.academicYearId)]);

export const readerProgress = pgTable('reader_progress', {
  id: id(), ...schoolCols(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  componentId: uuid('component_id').notNull().references(() => bookComponents.id, { onDelete: 'cascade' }),
  lastPage: integer('last_page').notNull().default(1),
  maxPage: integer('max_page').notNull().default(1),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('progress_user_comp_uq').on(t.userId, t.componentId)]);

export const bookmarks = pgTable('bookmarks', {
  id: id(), ...schoolCols(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  componentId: uuid('component_id').notNull().references(() => bookComponents.id, { onDelete: 'cascade' }),
  page: integer('page').notNull(),
  note: text('note').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('bookmark_uq').on(t.userId, t.componentId, t.page)]);

export const lessonPlans = pgTable('lesson_plans', {
  id: id(), ...schoolCols(),
  teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
  editionId: uuid('edition_id').references(() => bookEditions.id, { onDelete: 'set null' }),
  lessonId: uuid('lesson_id').references(() => bookLessons.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  planDate: timestamp('plan_date', { withTimezone: true }),
  durationMin: integer('duration_min').notNull().default(40),
  // { objectives, materials, warmUp, steps:[{title,minutes,detail}], practice, assessment, homework, differentiation, notes }
  content: jsonb('content').notNull().default({}),
  status: planStatusEnum('status').notNull().default('DRAFT'),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('plans_teacher_idx').on(t.teacherId)]);

export const questionBank = pgTable('question_bank', {
  id: id(), ...schoolCols(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  editionId: uuid('edition_id').references(() => bookEditions.id, { onDelete: 'set null' }),
  lessonId: uuid('lesson_id').references(() => bookLessons.id, { onDelete: 'set null' }),
  type: questionTypeEnum('type').notNull(),
  prompt: text('prompt').notNull(),
  options: jsonb('options').notNull().default([]),
  answer: jsonb('answer').notNull().default([]),
  difficulty: integer('difficulty').notNull().default(1),
  shared: boolean('shared').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index('qb_school_idx').on(t.schoolId, t.editionId)]);

export const assessments = pgTable('assessments', {
  id: id(), ...schoolCols(),
  teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  editionId: uuid('edition_id').references(() => bookEditions.id, { onDelete: 'set null' }),
  unitId: uuid('unit_id').references(() => bookUnits.id, { onDelete: 'set null' }),
  lessonId: uuid('lesson_id').references(() => bookLessons.id, { onDelete: 'set null' }),
  kind: assessmentKindEnum('kind').notNull().default('HOMEWORK'),
  title: text('title').notNull(),
  instructions: text('instructions').notNull().default(''),
  dueAt: timestamp('due_at', { withTimezone: true }),
  allowLate: boolean('allow_late').notNull().default(true),
  status: assessmentStatusEnum('status').notNull().default('DRAFT'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('assess_class_idx').on(t.classId, t.status)]);

export const assessmentItems = pgTable('assessment_items', {
  id: id(), ...schoolCols(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  type: questionTypeEnum('type').notNull(),
  prompt: text('prompt').notNull(),
  options: jsonb('options').notNull().default([]),
  answer: jsonb('answer').notNull().default([]),
  points: integer('points').notNull().default(1),
}, (t) => [index('items_assessment_idx').on(t.assessmentId), check('items_points_ck', sql`${t.points} BETWEEN 0 AND 100`)]);

/** Optional: assign to specific students only. No rows = whole class. */
export const assessmentStudents = pgTable('assessment_students', {
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ...schoolCols(),
}, (t) => [primaryKey({ columns: [t.assessmentId, t.studentId] })]);

export const submissions = pgTable('submissions', {
  id: id(), ...schoolCols(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // [{ itemId, response, correct: boolean|null, awarded: number|null }]
  answers: jsonb('answers').notNull().default([]),
  score: integer('score'),
  maxScore: integer('max_score').notNull(),
  status: submissionStatusEnum('status').notNull().default('SUBMITTED'),
  late: boolean('late').notNull().default(false),
  feedback: text('feedback').notNull().default(''),
  submittedAt: createdAt(),
  gradedAt: timestamp('graded_at', { withTimezone: true }),
  gradedBy: uuid('graded_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => [uniqueIndex('submission_uq').on(t.assessmentId, t.studentId)]);

export const evaluations = pgTable('evaluations', {
  id: id(), ...schoolCols(),
  teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
  subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
  term: text('term').notNull().default(''),
  skill: text('skill').notNull(),
  rating: integer('rating').notNull(),
  remarks: text('remarks').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [check('eval_rating_ck', sql`${t.rating} BETWEEN 1 AND 5`), index('eval_student_idx').on(t.studentId)]);

// =====================================================================================
// Phase 5 — AI teaching assistant
// =====================================================================================
/** Every AI request is recorded: who, what task, which book pages grounded it, tokens, outcome. Never student data. */
export const aiGenerations = pgTable('ai_generations', {
  id: id(), ...schoolCols(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  task: text('task').notNull(),
  editionId: uuid('edition_id').references(() => bookEditions.id, { onDelete: 'set null' }),
  lessonId: uuid('lesson_id').references(() => bookLessons.id, { onDelete: 'set null' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  params: jsonb('params').notNull().default({}),
  sources: jsonb('sources').notNull().default([]),
  grounded: boolean('grounded').notNull().default(false),
  output: jsonb('output'),
  status: text('status').notNull(), // OK | INVALID | ERROR | REFUSED
  error: text('error'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  latencyMs: integer('latency_ms').notNull().default(0),
  usedAs: text('used_as'), // LESSON_PLAN | ASSESSMENT | QUESTION_BANK
  usedId: uuid('used_id'),
  createdAt: createdAt(),
}, (t) => [index('ai_school_time_idx').on(t.schoolId, t.createdAt), index('ai_user_idx').on(t.userId)]);

// =====================================================================================
// Phase 6 — games, rewards & progress
// =====================================================================================
export const gameEngineEnum = pgEnum('game_engine', ['ALPHABET_MATCH', 'PICTURE_WORD', 'COUNTING', 'SORTING', 'MEMORY', 'FILL_BLANK', 'QUIZ', 'SHAPES', 'WORD_BUILD', 'PUZZLE']);

/** A playable game = engine + content. school_id NULL = publisher library (shared by every licensed school). */
export const gameActivities = pgTable('game_activities', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').references(() => schools.id, { onDelete: 'cascade' }),
  editionId: uuid('edition_id').references(() => bookEditions.id, { onDelete: 'set null' }),
  lessonId: uuid('lesson_id').references(() => bookLessons.id, { onDelete: 'set null' }),
  engine: gameEngineEnum('engine').notNull(),
  title: text('title').notNull(),
  instructions: text('instructions').notNull().default(''),
  difficulty: integer('difficulty').notNull().default(1),
  content: jsonb('content').notNull(),
  published: boolean('published').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('games_edition_idx').on(t.editionId, t.lessonId), check('games_difficulty_ck', sql`${t.difficulty} BETWEEN 1 AND 3`)]);

export const gameAssignments = pgTable('game_assignments', {
  id: id(), ...schoolCols(),
  activityId: uuid('activity_id').notNull().references(() => gameActivities.id, { onDelete: 'cascade' }),
  classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('game_assign_uq').on(t.activityId, t.classId)]);

export const gameAttempts = pgTable('game_attempts', {
  id: id(), ...schoolCols(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activityId: uuid('activity_id').notNull().references(() => gameActivities.id, { onDelete: 'cascade' }),
  assignmentId: uuid('assignment_id').references(() => gameAssignments.id, { onDelete: 'set null' }),
  score: integer('score').notNull(),
  maxScore: integer('max_score').notNull(),
  stars: integer('stars').notNull(),
  durationMs: integer('duration_ms').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index('attempts_student_idx').on(t.studentId, t.activityId), check('attempt_score_ck', sql`${t.score} >= 0 AND ${t.score} <= ${t.maxScore} AND ${t.stars} BETWEEN 0 AND 3`)]);

export const studentBadges = pgTable('student_badges', {
  ...schoolCols(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  badge: text('badge').notNull(),
  earnedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.studentId, t.badge] })]);

// ---------- flipbooks (HTML flipbook zip, or Flash/SWF played with Ruffle) ----------
export const flipbooks = pgTable('flipbooks', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  componentId: uuid('component_id').notNull().references(() => bookComponents.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().$type<'HTML' | 'SWF'>(),
  storagePrefix: text('storage_prefix').notNull(),
  entry: text('entry').notNull(),
  fileCount: integer('file_count').notNull(),
  totalBytes: bigint('total_bytes', { mode: 'number' }).notNull(),
  originalName: text('original_name').notNull(),
  skippedFiles: integer('skipped_files').notNull().default(0),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('flipbooks_component_uq').on(t.componentId)]);

export const flipbookFiles = pgTable('flipbook_files', {
  flipbookId: uuid('flipbook_id').notNull().references(() => flipbooks.id, { onDelete: 'cascade' }),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  path: text('path').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  mimeType: text('mime_type').notNull(),
}, (t) => [primaryKey({ columns: [t.flipbookId, t.path] })]);

// ---------- notifications ----------
export const notifications = pgTable('notifications', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').references(() => schools.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  link: text('link'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const messageOutbox = pgTable('message_outbox', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').references(() => schools.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  channel: text('channel').notNull().default('AUTO'),
  toAddress: text('to_address').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('PENDING'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: createdAt(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

// ---------- parents ----------
export const parentStudents = pgTable('parent_students', {
  parentId: uuid('parent_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  relation: text('relation').notNull().default('Parent'),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.parentId, t.studentId] })]);

