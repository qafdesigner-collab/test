import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import {
  assessments, bookComponents, bookEditions, bookLessons, bookPackages, bookUnits, bookmarks, digitalAssets, readerProgress, teachingResources,
} from '../db/schema';
import { AccessService } from '../lms/access.service';
import { AssetsService } from '../storage/assets.service';

@Injectable()
export class ReaderService {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly assets: AssetsService) {}
  private get q() { return this.db.q; }

  /** Everything the reader needs for one licensed edition. */
  async edition(editionId: string) {
    await this.access.assertEdition(editionId);
    const [ed] = await this.q.select({ id: bookEditions.id, label: bookEditions.label, title: bookPackages.title, coverColor: bookPackages.coverColor })
      .from(bookEditions).innerJoin(bookPackages, eq(bookPackages.id, bookEditions.packageId)).where(eq(bookEditions.id, editionId));
    if (!ed) throw new NotFoundException('Book not found');
    const comps = await this.q.select({ id: bookComponents.id, type: bookComponents.type, title: bookComponents.title, partNumber: bookComponents.partNumber,
      pageCount: bookComponents.pageCount, hasPdf: sql<boolean>`${bookComponents.bookAssetId} IS NOT NULL` })
      .from(bookComponents).where(eq(bookComponents.editionId, editionId)).orderBy(asc(bookComponents.sort));
    const ids = comps.map((c) => c.id);
    const units = ids.length ? await this.q.select().from(bookUnits).where(inArray(bookUnits.componentId, ids)).orderBy(asc(bookUnits.sort)) : [];
    const lessons = units.length ? await this.q.select().from(bookLessons).where(inArray(bookLessons.unitId, units.map((u) => u.id))).orderBy(asc(bookLessons.sort)) : [];
    const student = this.access.is('STUDENT') && !this.access.is('TEACHER');
    const resources = await this.q.select({ id: teachingResources.id, title: teachingResources.title, resourceType: teachingResources.resourceType, audience: teachingResources.audience,
      componentId: teachingResources.componentId, unitId: teachingResources.unitId, lessonId: teachingResources.lessonId, assetId: teachingResources.assetId, ext: digitalAssets.ext })
      .from(teachingResources).innerJoin(digitalAssets, eq(digitalAssets.id, teachingResources.assetId))
      .where(and(eq(teachingResources.editionId, editionId), student ? sql`${teachingResources.audience} IN ('ALL','STUDENT')` : undefined))
      .orderBy(asc(teachingResources.sort));
    const progress = ids.length && !this.db.ctx.staff ? await this.q.select().from(readerProgress).where(and(eq(readerProgress.userId, this.db.ctx.userId), inArray(readerProgress.componentId, ids))) : [];
    const marks = ids.length && !this.db.ctx.staff ? await this.q.select().from(bookmarks).where(and(eq(bookmarks.userId, this.db.ctx.userId), inArray(bookmarks.componentId, ids))).orderBy(asc(bookmarks.page)) : [];
    // Homework linked to this book for the current user's classes.
    const classIds = student ? await this.access.studentClassIds() : this.access.is('TEACHER') ? await this.access.teacherClassIds() : [];
    const linked = classIds.length ? await this.q.select({ id: assessments.id, title: assessments.title, kind: assessments.kind, lessonId: assessments.lessonId, unitId: assessments.unitId, dueAt: assessments.dueAt })
      .from(assessments).where(and(eq(assessments.editionId, editionId), eq(assessments.status, 'PUBLISHED'), inArray(assessments.classId, classIds))) : [];
    return {
      ...ed, student,
      components: comps.map((c) => ({
        ...c, progress: progress.find((p) => p.componentId === c.id) ?? null, bookmarks: marks.filter((b) => b.componentId === c.id),
        units: units.filter((u) => u.componentId === c.id).map((u) => ({ id: u.id, number: u.number, title: u.title,
          lessons: lessons.filter((l) => l.unitId === u.id).map((l) => ({ id: l.id, number: l.number, title: l.title, pageStart: l.pageStart, pageEnd: l.pageEnd })) })),
      })),
      resources, assessments: linked,
    };
  }

  private async component(id: string) {
    const [c] = await this.q.select().from(bookComponents).where(eq(bookComponents.id, id));
    if (!c) throw new NotFoundException('Book part not found');
    await this.access.assertEdition(c.editionId);
    return c;
  }

  async pdfLink(componentId: string) {
    const c = await this.component(componentId);
    if (!c.bookAssetId) throw new NotFoundException('The digital pages for this part have not been uploaded yet');
    return this.assets.link(c.bookAssetId, false);
  }

  async saveProgress(componentId: string, page: number) {
    const c = await this.component(componentId);
    if (c.pageCount && page > c.pageCount) throw new BadRequestException('Page out of range');
    const ctx = this.db.ctx;
    await this.q.insert(readerProgress).values({ publisherId: ctx.publisherId, schoolId: ctx.schoolId!, userId: ctx.userId, componentId, lastPage: page, maxPage: page })
      .onConflictDoUpdate({ target: [readerProgress.userId, readerProgress.componentId],
        set: { lastPage: page, maxPage: sql`greatest(${readerProgress.maxPage}, ${page})`, updatedAt: new Date() } });
    return { ok: true };
  }

  async addBookmark(componentId: string, page: number, note: string) {
    await this.component(componentId);
    const ctx = this.db.ctx;
    const [b] = await this.q.insert(bookmarks).values({ publisherId: ctx.publisherId, schoolId: ctx.schoolId!, userId: ctx.userId, componentId, page, note })
      .onConflictDoUpdate({ target: [bookmarks.userId, bookmarks.componentId, bookmarks.page], set: { note } }).returning();
    return b;
  }
  async removeBookmark(id: string) {
    await this.q.delete(bookmarks).where(and(eq(bookmarks.id, id), eq(bookmarks.userId, this.db.ctx.userId)));
    return { ok: true };
  }
}
