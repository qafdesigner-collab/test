import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, max, or, sql, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { qc } from '../db/qualify';
import {
  bookComponents, bookEditions, bookLessons, bookPackages, bookPages, bookUnits, digitalAssets, grades, subjects, teachingResources,
} from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { AssetsService, UploadedTemp } from '../storage/assets.service';
import {
  CreateComponentDto, CreateEditionDto, CreateLessonDto, CreatePackageDto, CreateUnitDto, PackageQuery, ReorderDto, UpdateUnitDto,
  UpdateComponentDto, UpdateEditionDto, UpdateLessonDto, UpdatePackageDto, UpdateResourceDto, UploadResourcesDto,
} from './publishing.dto';

type Edition = typeof bookEditions.$inferSelect;
/** structure = add/delete/reorder parts, units, lessons, page ranges; text = titles/descriptions; resources = attach/detach files */
type Change = 'structure' | 'text' | 'resources';

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'book';

const STANDARD_EXTRAS = [
  { type: 'HOMEWORK_BOOK', title: 'Homework Book' },
  { type: 'TEACHER_GUIDE', title: 'Teacher Guide' },
  { type: 'FLASHCARDS', title: 'Flashcards' },
  { type: 'TEACHER_CARDS', title: 'Teacher Cards' },
  { type: 'DANGLERS', title: 'Danglers' },
] as const;

@Injectable()
export class PublishingService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly assets: AssetsService) {}
  private get q() { return this.db.q; }
  private get pub() { return this.db.ctx.publisherId; }

  // =============== dashboard ===============
  async stats() {
    const byStatus = await this.q.select({ status: bookPackages.status, n: count() }).from(bookPackages).groupBy(bookPackages.status);
    const [{ editions }] = await this.q.select({ editions: count() }).from(bookEditions);
    const [{ resources }] = await this.q.select({ resources: count() }).from(teachingResources);
    const [{ files, bytes }] = await this.q.select({ files: count(), bytes: sql<number>`coalesce(sum(${digitalAssets.sizeBytes}),0)::bigint` }).from(digitalAssets);
    const [{ lessons }] = await this.q.select({ lessons: count() }).from(bookLessons);
    const recent = await this.q.select({ id: bookPackages.id, title: bookPackages.title, status: bookPackages.status, updatedAt: bookPackages.updatedAt, coverColor: bookPackages.coverColor })
      .from(bookPackages).orderBy(desc(bookPackages.updatedAt)).limit(6);
    const packages = Object.fromEntries(byStatus.map((r) => [r.status, r.n]));
    return { packages: { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0, ...packages }, editions, resources, lessons, files, storageBytes: Number(bytes), recent };
  }

  // =============== packages ===============
  async listPackages(f: PackageQuery) {
    const w: SQL[] = [];
    if (f.search) w.push(or(ilike(bookPackages.title, `%${f.search}%`), ilike(bookPackages.description, `%${f.search}%`))!);
    if (f.gradeId) w.push(eq(bookPackages.gradeId, f.gradeId));
    if (f.curriculumId) w.push(sql`${bookPackages.gradeId} IN (SELECT g.id FROM grades g WHERE g.curriculum_id = ${f.curriculumId})`);
    if (f.subjectId) w.push(eq(bookPackages.subjectId, f.subjectId));
    if (f.status) w.push(eq(bookPackages.status, f.status));
    const where = w.length ? and(...w) : undefined;
    const items = await this.q.select({
      id: bookPackages.id, title: bookPackages.title, slug: bookPackages.slug, status: bookPackages.status, coverColor: bookPackages.coverColor,
      description: bookPackages.description, updatedAt: bookPackages.updatedAt,
      grade: { id: grades.id, name: grades.name, stage: grades.stage },
      curriculum: sql<string>`(SELECT c.name FROM curricula c WHERE c.id = ${qc(grades.curriculumId)})`, subject: { id: subjects.id, name: subjects.name, color: subjects.color },
      editionCount: sql<number>`(SELECT count(*)::int FROM ${bookEditions} e WHERE e.package_id = ${qc(bookPackages.id)})`,
      latestEdition: sql<string | null>`(SELECT e.label FROM ${bookEditions} e WHERE e.package_id = ${qc(bookPackages.id)} ORDER BY e.edition_year DESC, e.created_at DESC LIMIT 1)`,
      resourceCount: sql<number>`(SELECT count(*)::int FROM ${teachingResources} r JOIN ${bookEditions} e ON e.id = r.edition_id WHERE e.package_id = ${qc(bookPackages.id)})`,
    }).from(bookPackages)
      .innerJoin(grades, eq(grades.id, bookPackages.gradeId)).innerJoin(subjects, eq(subjects.id, bookPackages.subjectId))
      .where(where).orderBy(asc(grades.sort), asc(subjects.sort), asc(bookPackages.title))
      .limit(f.pageSize).offset((f.page - 1) * f.pageSize);
    const [{ n }] = await this.q.select({ n: count() }).from(bookPackages).where(where);
    return { items, total: n, page: f.page, pageSize: f.pageSize };
  }

  async createPackage(dto: CreatePackageDto) {
    let slug = slugify(dto.title);
    const [clash] = await this.q.select({ n: count() }).from(bookPackages).where(ilike(bookPackages.slug, `${slug}%`));
    if (clash.n) slug = `${slug}-${clash.n + 1}`;
    const [pkg] = await this.q.insert(bookPackages).values({
      publisherId: this.pub, gradeId: dto.gradeId, subjectId: dto.subjectId, title: dto.title.trim(), slug,
      description: dto.description ?? '', coverColor: dto.coverColor ?? '#f97316', createdBy: this.db.ctx.userId,
    }).returning();
    const [edition] = await this.q.insert(bookEditions).values({
      publisherId: this.pub, packageId: pkg.id, label: dto.editionLabel.trim(), editionYear: dto.editionYear,
    }).returning();
    if (dto.standardStructure) {
      const parts = dto.parts ?? 3;
      const rows = [
        ...Array.from({ length: parts }, (_, i) => ({ type: 'STUDENT_BOOK' as const, title: `Student Book Part ${i + 1}`, partNumber: i + 1 })),
        ...STANDARD_EXTRAS.map((x) => ({ ...x, partNumber: null })),
      ];
      await this.q.insert(bookComponents).values(rows.map((r, i) => ({ publisherId: this.pub, editionId: edition.id, sort: i, ...r })));
    }
    await this.audit.log('publishing.package.create', 'book_package', pkg.id, `Created book package "${pkg.title}" with ${edition.label}`, undefined, pkg);
    return { ...pkg, editionId: edition.id };
  }

  async getPackage(id: string) {
    const [pkg] = await this.q.select({
      id: bookPackages.id, title: bookPackages.title, slug: bookPackages.slug, status: bookPackages.status, description: bookPackages.description,
      coverColor: bookPackages.coverColor, createdAt: bookPackages.createdAt, updatedAt: bookPackages.updatedAt,
      gradeId: bookPackages.gradeId, subjectId: bookPackages.subjectId, gradeName: grades.name, subjectName: subjects.name,
      curriculumName: sql<string>`(SELECT c.name FROM curricula c WHERE c.id = ${qc(grades.curriculumId)})`,
    }).from(bookPackages).innerJoin(grades, eq(grades.id, bookPackages.gradeId)).innerJoin(subjects, eq(subjects.id, bookPackages.subjectId))
      .where(eq(bookPackages.id, id));
    if (!pkg) throw new NotFoundException('Book package not found');
    const editions = await this.listEditions(id);
    return { ...pkg, editions };
  }

  async updatePackage(id: string, dto: UpdatePackageDto) {
    const [before] = await this.q.select().from(bookPackages).where(eq(bookPackages.id, id));
    if (!before) throw new NotFoundException('Book package not found');
    if (before.status === 'ARCHIVED') throw new ConflictException('Archived packages are read-only. Restore it first.');
    const [row] = await this.q.update(bookPackages).set({ ...dto, updatedAt: new Date() }).where(eq(bookPackages.id, id)).returning();
    await this.audit.log('publishing.package.update', 'book_package', id, `Updated details of "${row.title}"`, before, row);
    return row;
  }

  async setPackageArchived(id: string, archived: boolean) {
    const [before] = await this.q.select().from(bookPackages).where(eq(bookPackages.id, id));
    if (!before) throw new NotFoundException('Book package not found');
    let status: 'ARCHIVED' | 'PUBLISHED' | 'DRAFT' = 'ARCHIVED';
    if (!archived) {
      const [{ n }] = await this.q.select({ n: count() }).from(bookEditions).where(and(eq(bookEditions.packageId, id), eq(bookEditions.status, 'PUBLISHED')));
      status = n ? 'PUBLISHED' : 'DRAFT';
    }
    await this.q.update(bookPackages).set({ status, updatedAt: new Date() }).where(eq(bookPackages.id, id));
    await this.audit.log(archived ? 'publishing.package.archive' : 'publishing.package.restore', 'book_package', id,
      `${archived ? 'Archived' : 'Restored'} "${before.title}"`, { status: before.status }, { status });
    return { status };
  }

  // =============== editions ===============
  listEditions(packageId: string) {
    return this.q.select({
      id: bookEditions.id, label: bookEditions.label, editionYear: bookEditions.editionYear, status: bookEditions.status,
      notes: bookEditions.notes, publishedAt: bookEditions.publishedAt, clonedFromId: bookEditions.clonedFromId, createdAt: bookEditions.createdAt,
      componentCount: sql<number>`(SELECT count(*)::int FROM ${bookComponents} c WHERE c.edition_id = ${qc(bookEditions.id)})`,
      resourceCount: sql<number>`(SELECT count(*)::int FROM ${teachingResources} r WHERE r.edition_id = ${qc(bookEditions.id)})`,
    }).from(bookEditions).where(eq(bookEditions.packageId, packageId)).orderBy(desc(bookEditions.editionYear), desc(bookEditions.createdAt));
  }

  private async edition(id: string): Promise<Edition> {
    const [e] = await this.q.select().from(bookEditions).where(eq(bookEditions.id, id));
    if (!e) throw new NotFoundException('Edition not found');
    return e;
  }

  /** Enforces the content-immutability rules. */
  private async editable(editionId: string, change: Change) {
    const e = await this.edition(editionId);
    const [pkg] = await this.q.select({ status: bookPackages.status }).from(bookPackages).where(eq(bookPackages.id, e.packageId));
    if (e.status === 'ARCHIVED' || pkg.status === 'ARCHIVED') throw new ConflictException('This edition is archived and read-only.');
    if (e.status === 'PUBLISHED' && change === 'structure') {
      throw new ConflictException('This edition is published, so its structure is locked (schools may already hold licences for it). Create a new edition to change parts, units or lessons.');
    }
    return e;
  }
  private async touch(editionId: string) {
    const e = await this.edition(editionId);
    await this.q.update(bookPackages).set({ updatedAt: new Date() }).where(eq(bookPackages.id, e.packageId));
  }

  async createEdition(packageId: string, dto: CreateEditionDto) {
    const [pkg] = await this.q.select().from(bookPackages).where(eq(bookPackages.id, packageId));
    if (!pkg) throw new NotFoundException('Book package not found');
    if (pkg.status === 'ARCHIVED') throw new ConflictException('Archived packages are read-only.');
    let source: Edition | null = null;
    if (dto.cloneFromEditionId) {
      source = await this.edition(dto.cloneFromEditionId);
      if (source.packageId !== packageId) throw new BadRequestException('You can only copy an edition of the same book package');
    }
    const [ed] = await this.q.insert(bookEditions).values({
      publisherId: this.pub, packageId, label: dto.label.trim(), editionYear: dto.editionYear, notes: dto.notes ?? '', clonedFromId: source?.id ?? null,
    }).returning();
    if (source) await this.cloneInto(source.id, ed.id);
    await this.touch(ed.id);
    await this.audit.log('publishing.edition.create', 'book_edition', ed.id,
      `Created ${ed.label} of "${pkg.title}"${source ? ` (copied from ${source.label})` : ''}`, undefined, ed);
    return ed;
  }

  /** Deep-copies structure + resource links. Files (digital_assets) are shared, never duplicated. */
  private async cloneInto(fromId: string, toId: string) {
    const pub = this.pub;
    const comps = await this.q.select().from(bookComponents).where(eq(bookComponents.editionId, fromId));
    const compMap = new Map<string, string>(); const unitMap = new Map<string, string>(); const lessonMap = new Map<string, string>();
    for (const c of comps) {
      const { id, editionId, ...rest } = c;
      const [n] = await this.q.insert(bookComponents).values({ ...rest, editionId: toId, publisherId: pub }).returning({ id: bookComponents.id });
      compMap.set(id, n.id);
    }
    const units = comps.length ? await this.q.select().from(bookUnits).where(inArray(bookUnits.componentId, [...compMap.keys()])) : [];
    for (const u of units) {
      const { id, componentId, ...rest } = u;
      const [n] = await this.q.insert(bookUnits).values({ ...rest, componentId: compMap.get(componentId)! }).returning({ id: bookUnits.id });
      unitMap.set(id, n.id);
    }
    const lessons = units.length ? await this.q.select().from(bookLessons).where(inArray(bookLessons.unitId, [...unitMap.keys()])) : [];
    for (const l of lessons) {
      const { id, unitId, ...rest } = l;
      const [n] = await this.q.insert(bookLessons).values({ ...rest, unitId: unitMap.get(unitId)! }).returning({ id: bookLessons.id });
      lessonMap.set(id, n.id);
    }
    if (comps.length) {
      const pages = await this.q.select().from(bookPages).where(inArray(bookPages.componentId, [...compMap.keys()]));
      if (pages.length) await this.q.insert(bookPages).values(pages.map(({ id, ...p }) => ({
        ...p, componentId: compMap.get(p.componentId)!, lessonId: p.lessonId ? lessonMap.get(p.lessonId) ?? null : null,
      })));
    }
    const res = await this.q.select().from(teachingResources).where(eq(teachingResources.editionId, fromId));
    if (res.length) await this.q.insert(teachingResources).values(res.map(({ id, createdAt, ...r }) => ({
      ...r, editionId: toId,
      componentId: r.componentId ? compMap.get(r.componentId)! : null,
      unitId: r.unitId ? unitMap.get(r.unitId)! : null,
      lessonId: r.lessonId ? lessonMap.get(r.lessonId)! : null,
    })));
  }

  async getEditionTree(id: string) {
    const e = await this.edition(id);
    const [pkg] = await this.q.select({ id: bookPackages.id, title: bookPackages.title, status: bookPackages.status, coverColor: bookPackages.coverColor })
      .from(bookPackages).where(eq(bookPackages.id, e.packageId));
    const comps = await this.q.select({ ...getTableColumns(bookComponents), bookFile: sql<any>`(SELECT json_build_object('id', a.id, 'name', a.original_name, 'size', a.size_bytes) FROM digital_assets a WHERE a.id = ${qc(bookComponents.bookAssetId)})`,
      flipbook: sql<any>`(SELECT json_build_object('id', f.id, 'kind', f.kind, 'entry', f.entry, 'fileCount', f.file_count, 'totalBytes', f.total_bytes, 'originalName', f.original_name, 'skippedFiles', f.skipped_files, 'createdAt', f.created_at) FROM flipbooks f WHERE f.component_id = ${qc(bookComponents.id)})` })
      .from(bookComponents).where(eq(bookComponents.editionId, id)).orderBy(asc(bookComponents.sort), asc(bookComponents.partNumber));
    const compIds = comps.map((c) => c.id);
    const units = compIds.length ? await this.q.select().from(bookUnits).where(inArray(bookUnits.componentId, compIds)).orderBy(asc(bookUnits.sort), asc(bookUnits.number)) : [];
    const unitIds = units.map((u) => u.id);
    const lessons = unitIds.length ? await this.q.select().from(bookLessons).where(inArray(bookLessons.unitId, unitIds)).orderBy(asc(bookLessons.sort), asc(bookLessons.number)) : [];
    const resources = await this.q.select({
      id: teachingResources.id, title: teachingResources.title, resourceType: teachingResources.resourceType, audience: teachingResources.audience,
      componentId: teachingResources.componentId, unitId: teachingResources.unitId, lessonId: teachingResources.lessonId, sort: teachingResources.sort,
      createdAt: teachingResources.createdAt,
      asset: { id: digitalAssets.id, originalName: digitalAssets.originalName, ext: digitalAssets.ext, sizeBytes: digitalAssets.sizeBytes, scanStatus: digitalAssets.scanStatus },
      sharedWith: sql<number>`(SELECT count(*)::int - 1 FROM ${teachingResources} r2 WHERE r2.asset_id = ${qc(teachingResources.assetId)})`,
    }).from(teachingResources).innerJoin(digitalAssets, eq(digitalAssets.id, teachingResources.assetId))
      .where(eq(teachingResources.editionId, id)).orderBy(asc(teachingResources.sort), asc(teachingResources.createdAt));
    return {
      ...e, package: pkg,
      locked: { structure: e.status !== 'DRAFT' || pkg.status === 'ARCHIVED', all: e.status === 'ARCHIVED' || pkg.status === 'ARCHIVED' },
      components: comps.map((c) => ({
        ...c, units: units.filter((u) => u.componentId === c.id).map((u) => ({ ...u, lessons: lessons.filter((l) => l.unitId === u.id) })),
      })),
      resources,
    };
  }

  async updateEdition(id: string, dto: UpdateEditionDto) {
    const before = await this.editable(id, 'text');
    const [row] = await this.q.update(bookEditions).set({ ...dto, updatedAt: new Date() }).where(eq(bookEditions.id, id)).returning();
    await this.touch(id);
    await this.audit.log('publishing.edition.update', 'book_edition', id, `Updated edition ${row.label}`, before, row);
    return row;
  }

  async publishEdition(id: string) {
    const e = await this.edition(id);
    if (e.status !== 'DRAFT') throw new ConflictException(`Only draft editions can be published (this one is ${e.status.toLowerCase()}).`);
    const [{ n }] = await this.q.select({ n: count() }).from(bookComponents).where(eq(bookComponents.editionId, id));
    if (!n) throw new BadRequestException('Add at least one book component (e.g. Student Book Part 1) before publishing.');
    const [row] = await this.q.update(bookEditions).set({ status: 'PUBLISHED', publishedAt: new Date(), publishedBy: this.db.ctx.userId, updatedAt: new Date() })
      .where(eq(bookEditions.id, id)).returning();
    await this.q.update(bookPackages).set({ status: 'PUBLISHED', updatedAt: new Date() })
      .where(and(eq(bookPackages.id, e.packageId), eq(bookPackages.status, 'DRAFT')));
    await this.audit.log('publishing.edition.publish', 'book_edition', id, `Published ${row.label}`, { status: e.status }, { status: 'PUBLISHED' });
    return row;
  }

  async archiveEdition(id: string) {
    const e = await this.edition(id);
    if (e.status === 'ARCHIVED') return e;
    const [row] = await this.q.update(bookEditions).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(eq(bookEditions.id, id)).returning();
    await this.touch(id);
    await this.audit.log('publishing.edition.archive', 'book_edition', id, `Archived ${row.label}`, { status: e.status }, { status: 'ARCHIVED' });
    return row;
  }

  async deleteEdition(id: string) {
    const e = await this.edition(id);
    if (e.status !== 'DRAFT') throw new ConflictException('Only draft editions can be deleted. Archive published editions instead.');
    const [{ n }] = await this.q.select({ n: count() }).from(bookEditions).where(eq(bookEditions.packageId, e.packageId));
    if (n <= 1) throw new ConflictException('A book package needs at least one edition.');
    await this.q.delete(bookEditions).where(eq(bookEditions.id, id));
    await this.audit.log('publishing.edition.delete', 'book_edition', id, `Deleted draft ${e.label}`, e);
    return { ok: true };
  }

  // =============== structure: components / units / lessons ===============
  async addComponent(editionId: string, dto: CreateComponentDto) {
    await this.editable(editionId, 'structure');
    const [{ m }] = await this.q.select({ m: max(bookComponents.sort) }).from(bookComponents).where(eq(bookComponents.editionId, editionId));
    const [row] = await this.q.insert(bookComponents).values({ publisherId: this.pub, editionId, ...dto, sort: (m ?? -1) + 1 }).returning();
    await this.touch(editionId);
    await this.audit.log('publishing.component.create', 'book_component', row.id, `Added "${row.title}"`, undefined, row);
    return row;
  }
  private async component(id: string) {
    const [c] = await this.q.select().from(bookComponents).where(eq(bookComponents.id, id));
    if (!c) throw new NotFoundException('Component not found');
    return c;
  }
  async updateComponent(id: string, dto: UpdateComponentDto) {
    const before = await this.component(id);
    const structural = (dto.type && dto.type !== before.type) || (dto.partNumber !== undefined && dto.partNumber !== before.partNumber) || (dto.pageCount !== undefined && dto.pageCount !== before.pageCount);
    await this.editable(before.editionId, structural ? 'structure' : 'text');
    const [row] = await this.q.update(bookComponents).set(dto).where(eq(bookComponents.id, id)).returning();
    await this.touch(before.editionId);
    await this.audit.log('publishing.component.update', 'book_component', id, `Updated "${row.title}"`, before, row);
    return row;
  }
  async deleteComponent(id: string) {
    const c = await this.component(id);
    await this.editable(c.editionId, 'structure');
    await this.q.delete(bookComponents).where(eq(bookComponents.id, id));
    await this.touch(c.editionId);
    await this.audit.log('publishing.component.delete', 'book_component', id, `Removed "${c.title}" (with its units, lessons and resource links)`, c);
    return { ok: true };
  }

  async addUnit(componentId: string, dto: CreateUnitDto) {
    const c = await this.component(componentId);
    await this.editable(c.editionId, 'structure');
    const [agg] = await this.q.select({ m: max(bookUnits.sort), n: max(bookUnits.number) }).from(bookUnits).where(eq(bookUnits.componentId, componentId));
    const [row] = await this.q.insert(bookUnits).values({
      publisherId: this.pub, componentId, title: dto.title, description: dto.description ?? '', number: dto.number ?? (agg.n ?? 0) + 1, sort: (agg.m ?? -1) + 1,
    }).returning();
    await this.touch(c.editionId);
    await this.audit.log('publishing.unit.create', 'book_unit', row.id, `Added Unit ${row.number}: ${row.title}`, undefined, row);
    return row;
  }
  private async unit(id: string) {
    const [u] = await this.q.select({ unit: bookUnits, editionId: bookComponents.editionId }).from(bookUnits)
      .innerJoin(bookComponents, eq(bookComponents.id, bookUnits.componentId)).where(eq(bookUnits.id, id));
    if (!u) throw new NotFoundException('Unit not found');
    return u;
  }
  async updateUnit(id: string, dto: UpdateUnitDto) {
    const { unit, editionId } = await this.unit(id);
    await this.editable(editionId, dto.number !== undefined && dto.number !== unit.number ? 'structure' : 'text');
    const [row] = await this.q.update(bookUnits).set(dto).where(eq(bookUnits.id, id)).returning();
    await this.touch(editionId);
    await this.audit.log('publishing.unit.update', 'book_unit', id, `Updated Unit ${row.number}: ${row.title}`, unit, row);
    return row;
  }
  async deleteUnit(id: string) {
    const { unit, editionId } = await this.unit(id);
    await this.editable(editionId, 'structure');
    await this.q.delete(bookUnits).where(eq(bookUnits.id, id));
    await this.touch(editionId);
    await this.audit.log('publishing.unit.delete', 'book_unit', id, `Removed Unit ${unit.number}: ${unit.title}`, unit);
    return { ok: true };
  }

  async addLesson(unitId: string, dto: CreateLessonDto) {
    const { editionId } = await this.unit(unitId);
    await this.editable(editionId, 'structure');
    const [agg] = await this.q.select({ m: max(bookLessons.sort), n: max(bookLessons.number) }).from(bookLessons).where(eq(bookLessons.unitId, unitId));
    const [row] = await this.q.insert(bookLessons).values({
      publisherId: this.pub, unitId, title: dto.title, objectives: dto.objectives ?? '', pageStart: dto.pageStart ?? null, pageEnd: dto.pageEnd ?? null,
      number: dto.number ?? (agg.n ?? 0) + 1, sort: (agg.m ?? -1) + 1,
    }).returning();
    await this.touch(editionId);
    await this.audit.log('publishing.lesson.create', 'book_lesson', row.id, `Added Lesson ${row.number}: ${row.title}`, undefined, row);
    return row;
  }
  private async lesson(id: string) {
    const [l] = await this.q.select({ lesson: bookLessons, editionId: bookComponents.editionId, componentId: bookComponents.id }).from(bookLessons)
      .innerJoin(bookUnits, eq(bookUnits.id, bookLessons.unitId)).innerJoin(bookComponents, eq(bookComponents.id, bookUnits.componentId))
      .where(eq(bookLessons.id, id));
    if (!l) throw new NotFoundException('Lesson not found');
    return l;
  }
  async updateLesson(id: string, dto: UpdateLessonDto) {
    const { lesson, editionId } = await this.lesson(id);
    const structural = (['number', 'pageStart', 'pageEnd'] as const).some((k) => dto[k] !== undefined && dto[k] !== lesson[k]);
    await this.editable(editionId, structural ? 'structure' : 'text');
    const [row] = await this.q.update(bookLessons).set(dto).where(eq(bookLessons.id, id)).returning();
    await this.touch(editionId);
    await this.audit.log('publishing.lesson.update', 'book_lesson', id, `Updated Lesson ${row.number}: ${row.title}`, lesson, row);
    return row;
  }
  async deleteLesson(id: string) {
    const { lesson, editionId } = await this.lesson(id);
    await this.editable(editionId, 'structure');
    await this.q.delete(bookLessons).where(eq(bookLessons.id, id));
    await this.touch(editionId);
    await this.audit.log('publishing.lesson.delete', 'book_lesson', id, `Removed Lesson ${lesson.number}: ${lesson.title}`, lesson);
    return { ok: true };
  }

  async reorder(dto: ReorderDto) {
    const ids = [...new Set(dto.ids)];
    const tables = { component: bookComponents, unit: bookUnits, lesson: bookLessons, resource: teachingResources } as const;
    const t = tables[dto.kind];
    const parentCol = { component: bookComponents.editionId, unit: bookUnits.componentId, lesson: bookLessons.unitId, resource: teachingResources.editionId }[dto.kind];
    const rows = await this.q.select({ id: t.id, parent: parentCol }).from(t as any).where(inArray(t.id, ids));
    if (rows.length !== ids.length || new Set(rows.map((r) => r.parent)).size !== 1) throw new BadRequestException('Items must exist and share the same parent');
    const editionId = dto.kind === 'component' || dto.kind === 'resource' ? rows[0].parent
      : dto.kind === 'unit' ? (await this.component(rows[0].parent)).editionId : (await this.unit(rows[0].parent)).editionId;
    await this.editable(editionId, dto.kind === 'resource' ? 'resources' : 'structure');
    for (const [i, id] of ids.entries()) await this.q.update(t as any).set({ sort: i }).where(eq(t.id, id));
    await this.touch(editionId);
    await this.audit.log(`publishing.${dto.kind}.reorder`, 'book_edition', editionId, `Reordered ${dto.kind}s`, undefined, { ids });
    return { ok: true };
  }

  // =============== the book's own PDF (digital reader) ===============
  async setBookPdf(componentId: string, file: UploadedTemp) {
    try {
      const c = await this.component(componentId);
      const e = await this.edition(c.editionId);
      if (e.status === 'ARCHIVED') throw new ConflictException('This edition is archived.');
      // Page numbering is part of the structure: a published edition may receive its PDF once, but not replace it.
      if (e.status === 'PUBLISHED' && c.bookAssetId) throw new ConflictException('This edition is published — its book PDF cannot be replaced. Create a new edition.');
      if (!/\.pdf$/i.test(file.originalname)) throw new BadRequestException('The digital book must be a PDF file');
      const head = require('fs').readFileSync(file.path);
      const pages = (head.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length || null;
      const { asset, reused } = await this.assets.ingest(file);
      await this.q.update(bookComponents).set({ bookAssetId: asset.id, pageCount: c.pageCount && e.status === 'PUBLISHED' ? c.pageCount : pages ?? c.pageCount })
        .where(eq(bookComponents.id, componentId));
      await this.touch(c.editionId);
      await this.audit.log('publishing.component.book_pdf', 'book_component', componentId, `Attached the book PDF to "${c.title}" (${pages ?? '?'} pages${reused ? ', existing file reused' : ''})`);
      return { ok: true, pages, reused };
    } finally {
      require('fs').promises.rm(file.path, { force: true }).catch(() => undefined);
    }
  }
  async removeBookPdf(componentId: string) {
    const c = await this.component(componentId);
    await this.editable(c.editionId, 'structure');
    await this.q.update(bookComponents).set({ bookAssetId: null }).where(eq(bookComponents.id, componentId));
    await this.audit.log('publishing.component.book_pdf_remove', 'book_component', componentId, `Removed the book PDF of "${c.title}"`);
    return { ok: true };
  }

  // =============== resources ===============
  /** Resolve the narrowest given scope and verify the whole chain belongs to this edition. */
  private async resolveScope(editionId: string, s: { componentId?: string | null; unitId?: string | null; lessonId?: string | null }) {
    if (s.lessonId) {
      const l = await this.lesson(s.lessonId);
      if (l.editionId !== editionId) throw new BadRequestException('Lesson is not part of this edition');
      return { componentId: l.componentId, unitId: l.lesson.unitId, lessonId: l.lesson.id };
    }
    if (s.unitId) {
      const u = await this.unit(s.unitId);
      if (u.editionId !== editionId) throw new BadRequestException('Unit is not part of this edition');
      return { componentId: u.unit.componentId, unitId: u.unit.id, lessonId: null };
    }
    if (s.componentId) {
      const c = await this.component(s.componentId);
      if (c.editionId !== editionId) throw new BadRequestException('Component is not part of this edition');
      return { componentId: c.id, unitId: null, lessonId: null };
    }
    return { componentId: null, unitId: null, lessonId: null };
  }

  async uploadResources(editionId: string, files: UploadedTemp[], dto: UploadResourcesDto) {
    try {
      await this.editable(editionId, 'resources');
      if (!files?.length) throw new BadRequestException('Choose at least one file');
      const scope = await this.resolveScope(editionId, dto);
      const [{ m }] = await this.q.select({ m: max(teachingResources.sort) }).from(teachingResources).where(eq(teachingResources.editionId, editionId));
      let sort = (m ?? -1) + 1;
      const created = [];
      for (const f of files) {
        const { asset, reused, kind } = await this.assets.ingest(f);
        const [row] = await this.q.insert(teachingResources).values({
          publisherId: this.pub, editionId, ...scope, assetId: asset.id,
          title: (files.length === 1 && dto.title?.trim()) || f.originalname.replace(/\.[^.]+$/, '').slice(0, 200),
          resourceType: (dto.resourceType ?? kind.resourceType) as any, audience: dto.audience ?? 'TEACHER', sort: sort++, createdBy: this.db.ctx.userId,
        }).returning();
        created.push({ ...row, reusedExistingFile: reused, scanStatus: asset.scanStatus });
        await this.audit.log('publishing.resource.add', 'teaching_resource', row.id,
          `Attached "${row.title}" (${asset.ext.toUpperCase()}, ${reused ? 'existing file reused' : 'new file'})`, undefined, { ...row, assetId: asset.id });
      }
      await this.touch(editionId);
      return created;
    } finally {
      // Any temp files not yet consumed (e.g. validation failed early) are removed.
      for (const f of files ?? []) require('fs').promises.rm(f.path, { force: true }).catch(() => undefined);
    }
  }

  private async resource(id: string) {
    const [r] = await this.q.select().from(teachingResources).where(eq(teachingResources.id, id));
    if (!r) throw new NotFoundException('Resource not found');
    return r;
  }
  async updateResource(id: string, dto: UpdateResourceDto) {
    const before = await this.resource(id);
    await this.editable(before.editionId, 'resources');
    const patch: Record<string, unknown> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.resourceType !== undefined) patch.resourceType = dto.resourceType;
    if (dto.audience !== undefined) patch.audience = dto.audience;
    if ('componentId' in dto || 'unitId' in dto || 'lessonId' in dto) Object.assign(patch, await this.resolveScope(before.editionId, dto));
    const [row] = await this.q.update(teachingResources).set(patch).where(eq(teachingResources.id, id)).returning();
    await this.audit.log('publishing.resource.update', 'teaching_resource', id, `Updated resource "${row.title}"`, before, row);
    return row;
  }
  async deleteResource(id: string) {
    const r = await this.resource(id);
    await this.editable(r.editionId, 'resources');
    await this.q.delete(teachingResources).where(eq(teachingResources.id, id));
    await this.touch(r.editionId);
    await this.audit.log('publishing.resource.remove', 'teaching_resource', id, `Removed resource "${r.title}" (file kept for other editions)`, r);
    return { ok: true };
  }
}
