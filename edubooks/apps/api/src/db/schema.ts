// Drizzle schema — Phase 1 (foundation) + Phase 2 (publishing).
// Every tenant-owned row carries publisher_id (and school_id where school-private) so that
// PostgreSQL Row-Level Security policies (see drizzle/*_rls.sql) stay simple and indexable.
import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, text, integer, bigint, boolean, timestamp, jsonb, customType, index, uniqueIndex, primaryKey, check,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ---------- enums ----------
export const roleEnum = pgEnum('role', ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT']);
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
  passwordHash: text('password_hash').notNull(),
  status: accountStatusEnum('status').notNull().default('ACTIVE'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
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
export const grades = pgTable('grades', {
  id: id(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  name: citext('name').notNull(),
  sort: integer('sort').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('grades_name_uq').on(t.publisherId, t.name)]);

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
