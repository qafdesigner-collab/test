import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { qc } from '../db/qualify';
import { DbService } from '../db/db.service';
import {
  assessments, bookComponents, bookEditions, bookLessons, bookPackages, bookUnits, bookmarks, digitalAssets, readerProgress, teachingResources,
} from '../db/schema';
import { AccessService } from '../lms/access.service';
import { AssetsService } from '../storage/assets.service';
import { checkUrl } from '../common/urls';

@Injectable()
export class ReaderService {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly assets: AssetsService) {}
  private get q() { return this.db.q; }

  /** Everything the reader needs for one licensed edition. */
  async edition(editionId: string) {
    await this.access.assertEdition(editionId);
    const [ed] = await this.q.select({ id: bookEditions.id, label: bookEditions.label, title: bookPackages.title, coverUrl: sql<string | null>`CASE WHEN ${bookPackages.coverVersion} IS NOT NULL THEN '/api/covers/' || ${bookPackages.id} || '?v=' || ${bookPackages.coverVersion} END`, coverColor: bookPackages.coverColor })
      .from(bookEditions).innerJoin(bookPackages, eq(bookPackages.id, bookEditions.packageId)).where(eq(bookEditions.id, editionId));
    if (!ed) throw new NotFoundException('Book not found');
    let comps = await this.q.select({ id: bookComponents.id, type: bookComponents.type, title: bookComponents.title, partNumber: bookComponents.partNumber,
      pageCount: bookComponents.pageCount, hasPdf: sql<boolean>`${bookComponents.bookAssetId} IS NOT NULL`,
      flipbook: sql<string | null>`(SELECT f.kind FROM flipbooks f WHERE f.component_id = ${qc(bookComponents.id)})`,
      hasApp: sql<boolean>`EXISTS (SELECT 1 FROM book_apps a WHERE a.component_id = ${qc(bookComponents.id)} AND (a.asset_id IS NOT NULL OR a.android_url IS NOT NULL OR a.ios_url IS NOT NULL))` })
      .from(bookComponents).where(eq(bookComponents.editionId, editionId)).orderBy(asc(bookComponents.sort));
    const student = this.access.is('STUDENT') && !this.access.is('TEACHER');
    const resources = await this.q.select({ id: teachingResources.id, title: teachingResources.title, resourceType: teachingResources.resourceType, audience: teachingResources.audience,
      componentId: teachingResources.componentId, unitId: teachingResources.unitId, lessonId: teachingResources.lessonId, assetId: teachingResources.assetId, ext: digitalAssets.ext })
      .from(teachingResources).innerJoin(digitalAssets, eq(digitalAssets.id, teachingResources.assetId))
      .where(and(eq(teachingResources.editionId, editionId), student ? sql`${teachingResources.audience} IN ('ALL','STUDENT')` : undefined))
      .orderBy(asc(teachingResources.sort));
    // Only parts the publisher actually uploaded something for are shown (pages, flipbook/CD, app, or resources).
    const withFiles = new Set(resources.map((r) => r.componentId).filter(Boolean));
    comps = comps.filter((c) => c.hasPdf || c.flipbook || c.hasApp || withFiles.has(c.id));
    const ids = comps.map((c) => c.id);
    const units = ids.length ? await this.q.select().from(bookUnits).where(inArray(bookUnits.componentId, ids)).orderBy(asc(bookUnits.sort)) : [];
    const lessons = units.length ? await this.q.select().from(bookLessons).where(inArray(bookLessons.unitId, units.map((u) => u.id))).orderBy(asc(bookLessons.sort)) : [];
    const progress = ids.length && !this.db.ctx.staff ? await this.q.select().from(readerProgress).where(and(eq(readerProgress.userId, this.db.ctx.userId), inArray(readerProgress.componentId, ids))) : [];
    const marks = ids.length && !this.db.ctx.staff ? await this.q.select().from(bookmarks).where(and(eq(bookmarks.userId, this.db.ctx.userId), inArray(bookmarks.componentId, ids))).orderBy(asc(bookmarks.page)) : [];
    // Homework linked to this book for the current user's classes.
    const classIds = student ? await this.access.studentClassIds() : this.access.is('TEACHER') ? await this.access.teacherClassIds() : [];
    const linked = classIds.length ? await this.q.select({ id: assessments.id, title: assessments.title, kind: assessments.kind, lessonId: assessments.lessonId, unitId: assessments.unitId, dueAt: assessments.dueAt })
      .from(assessments).where(and(eq(assessments.editionId, editionId), eq(assessments.status, 'PUBLISHED'), inArray(assessments.classId, classIds))) : [];
    // Published games for this book (publisher library + this school's own).
    const { rows: games } = await this.q.execute(sql`SELECT id, title, engine, lesson_id AS "lessonId" FROM game_activities
      WHERE edition_id = ${editionId} AND ((school_id IS NULL AND published) OR school_id = ${this.db.ctx.schoolId ?? '00000000-0000-0000-0000-000000000000'}) ORDER BY title`);
    return {
      ...ed, student, games,
      components: comps.map((c) => ({
        ...c, progress: progress.find((p) => p.componentId === c.id) ?? null, bookmarks: marks.filter((b) => b.componentId === c.id),
        units: units.filter((u) => u.componentId === c.id).map((u) => ({ id: u.id, number: u.number, title: u.title,
          lessons: lessons.filter((l) => l.unitId === u.id).map((l) => ({ id: l.id, number: l.number, title: l.title, pageStart: l.pageStart, pageEnd: l.pageEnd })) })),
      })),
      resources: resources.filter((r) => !r.componentId || ids.includes(r.componentId)), assessments: linked,
    };
  }

  private async component(id: string) {
    const [c] = await this.q.select().from(bookComponents).where(eq(bookComponents.id, id));
    if (!c) throw new NotFoundException('Book part not found');
    await this.access.assertEdition(c.editionId);
    return c;
  }

  // ---------- interactive page hotspots ----------
  async hotspots(componentId: string) {
    await this.component(componentId);
    const { rows } = await this.q.execute(sql`SELECT h.id, h.page, h.x, h.y, h.w, h.h, h.kind, h.title, h.body, h.url, h.game_id AS "gameId", g.title AS "gameTitle", g.engine AS "gameEngine"
      FROM page_hotspots h LEFT JOIN game_activities g ON g.id = h.game_id WHERE h.component_id = ${componentId} ORDER BY h.page, h.y, h.x`);
    return rows;
  }
  private async hotspotValues(d: { kind?: string; url?: string | null; gameId?: string | null; x?: number; y?: number; w?: number; h?: number }, editionId: string) {
    if (d.x !== undefined && d.w !== undefined && d.x + d.w > 1.0001) throw new BadRequestException('The area goes past the right edge of the page');
    if (d.y !== undefined && d.h !== undefined && d.y + d.h > 1.0001) throw new BadRequestException('The area goes past the bottom of the page');
    const url = d.kind ? checkUrl(d.kind, d.url) : undefined;
    if (d.kind === 'GAME') {
      if (!d.gameId) throw new BadRequestException('Choose a game');
      const { rows } = await this.q.execute(sql`SELECT 1 FROM game_activities WHERE id = ${d.gameId} AND school_id IS NULL AND (edition_id = ${editionId} OR edition_id IS NULL)`);
      if (!rows.length) throw new BadRequestException('Choose one of the publisher games for this book');
    }
    return { url, gameId: d.kind === 'GAME' ? d.gameId! : d.kind ? null : undefined };
  }
  async addHotspot(componentId: string, d: any) {
    const c = await this.component(componentId);
    if (c.pageCount && d.page > c.pageCount) throw new BadRequestException('Page out of range');
    const v = await this.hotspotValues(d, c.editionId);
    if ((d.kind === 'NOTE' || d.kind === 'AUDIO') && !d.body?.trim()) throw new BadRequestException(d.kind === 'AUDIO' ? 'Type the words to read aloud' : 'Type the note');
    const { rows: [h] } = await this.q.execute(sql`INSERT INTO page_hotspots (publisher_id, component_id, page, x, y, w, h, kind, title, body, url, game_id, created_by)
      VALUES (${this.db.ctx.publisherId}, ${componentId}, ${d.page}, ${d.x}, ${d.y}, ${d.w}, ${d.h}, ${d.kind}, ${d.title?.trim() ?? ''}, ${d.body ?? ''}, ${v.url ?? null}, ${v.gameId ?? null}, ${this.db.ctx.userId})
      RETURNING id`);
    return h;
  }
  async updateHotspot(id: string, d: any) {
    const { rows: [cur] } = await this.q.execute(sql`SELECT h.*, c.edition_id FROM page_hotspots h JOIN book_components c ON c.id = h.component_id WHERE h.id = ${id}`) as any;
    if (!cur) throw new NotFoundException('Hotspot not found');
    const m = { ...cur, ...Object.fromEntries(Object.entries(d).filter(([, x]) => x !== undefined)), gameId: d.gameId !== undefined ? d.gameId : cur.game_id };
    const v = await this.hotspotValues({ ...m, url: m.url }, cur.edition_id);
    await this.q.execute(sql`UPDATE page_hotspots SET page = ${m.page}, x = ${m.x}, y = ${m.y}, w = ${m.w}, h = ${m.h}, kind = ${m.kind}, title = ${(m.title ?? '').trim()},
      body = ${m.body ?? ''}, url = ${v.url ?? null}, game_id = ${v.gameId ?? null} WHERE id = ${id}`);
    return { ok: true };
  }
  async removeHotspot(id: string) {
    const { rows } = await this.q.execute(sql`DELETE FROM page_hotspots WHERE id = ${id} RETURNING id`);
    if (!rows.length) throw new NotFoundException('Hotspot not found');
    return { ok: true };
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
