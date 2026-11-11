import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { pipeline } from 'stream/promises';
import { DbService, TenantCtx } from '../db/db.service';
import { bookComponents, bookLessons, bookPages, bookUnits, digitalAssets } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { extractPdfPages } from './extract';
import { ocrAvailable, ocrPages } from './ocr';
import { AiProviderService } from './provider.service';

/** Builds the searchable text index of a book part (book_pages) from its PDF. */
@Injectable()
export class IndexerService {
  private readonly log = new Logger('BookIndexer');
  private readonly running = new Set<string>();
  constructor(private readonly db: DbService, private readonly assets: AssetsService, private readonly audit: AuditService, private readonly ai: AiProviderService) {}

  /** Starts indexing in the background (own transaction); returns immediately. */
  async start(componentId: string) {
    const ctx: TenantCtx = { ...this.db.ctx };
    if (this.running.has(componentId)) return { started: false, reason: 'Already running' };
    this.running.add(componentId);
    // Mark RUNNING in the caller's transaction. The background job's final update waits on this row lock,
    // so a fast job can never be overwritten by the RUNNING status committing later.
    await this.db.q.update(bookComponents).set({ indexStatus: 'RUNNING', indexError: null }).where(eq(bookComponents.id, componentId));
    setImmediate(() => {
      this.db.detached(ctx, () => this.run(componentId))
        .catch((e) => this.db.detached(ctx, async () => {
          this.log.warn(`index ${componentId} failed: ${e.message}`);
          await this.db.q.update(bookComponents).set({ indexStatus: 'ERROR', indexError: String(e.message).slice(0, 300) }).where(eq(bookComponents.id, componentId));
        }).catch(() => undefined))
        .finally(() => this.running.delete(componentId));
    });
    return { started: true };
  }

  private async run(componentId: string) {
    // FOR UPDATE: waits until the transaction that uploaded the PDF has committed, then sees its result.
    const [c] = await this.db.q.select().from(bookComponents).where(eq(bookComponents.id, componentId)).for('update');
    if (!c?.bookAssetId) throw new NotFoundException('This part has no book PDF');
    const [asset] = await this.db.q.select().from(digitalAssets).where(eq(digitalAssets.id, c.bookAssetId));
    const tmp = path.join(os.tmpdir(), `idx-${randomBytes(8).toString('hex')}.pdf`);
    try {
      await pipeline(await this.assets.driver.read(asset.storageKey), fs.createWriteStream(tmp));
      const { pages } = await extractPdfPages(tmp);
      // Scanned pages have no text layer: read them with OCR when the server has it installed.
      const blank = pages.map((p, i) => (p.trim().length > 20 ? 0 : i + 1)).filter(Boolean);
      const ocr = await ocrAvailable();
      let ocrCount = 0;
      if (blank.length && ocr.ok) {
        const found = await ocrPages(tmp, blank);
        for (const [n, text] of found) if (text.length > 20) { pages[n - 1] = text; ocrCount++; }
      }
      const n = await this.store(c.id, c.publisherId, pages);
      const withText = pages.filter((p) => p.trim().length > 20).length;
      await this.db.q.update(bookComponents).set({ indexStatus: withText ? 'DONE' : 'NO_TEXT', indexedPages: withText, indexedAt: new Date(),
        indexError: withText ? null : ocr.ok ? 'No readable text found, even with OCR — check the scan quality.' : 'No selectable text found — the PDF may be scanned images and OCR is not installed on the server.' })
        .where(eq(bookComponents.id, c.id));
      await this.audit.log('ai.index', 'book_component', c.id, `Indexed “${c.title}” for the AI assistant: ${withText} of ${n} pages with text${ocrCount ? ` (${ocrCount} read with OCR)` : ''}`);
      if (withText && this.ai.embeddingsEnabled) await this.embed(c.id).catch((e) => this.log.warn(`embeddings skipped: ${e.message}`));
    } finally {
      fs.promises.rm(tmp, { force: true }).catch(() => undefined);
    }
  }

  /** Replace the page rows of a component and link each page to the lesson whose page range covers it. */
  async store(componentId: string, publisherId: string, pages: string[]) {
    await this.db.q.delete(bookPages).where(eq(bookPages.componentId, componentId));
    const lessons = await this.db.q.select({ id: bookLessons.id, a: bookLessons.pageStart, b: bookLessons.pageEnd }).from(bookLessons)
      .innerJoin(bookUnits, eq(bookUnits.id, bookLessons.unitId)).where(eq(bookUnits.componentId, componentId));
    const rows = pages.map((text, i) => {
      const page = i + 1;
      const l = lessons.find((x) => x.a && page >= x.a && page <= (x.b ?? x.a));
      return { publisherId, componentId, pageNumber: page, textContent: text.slice(0, 20_000), lessonId: l?.id ?? null };
    });
    for (let i = 0; i < rows.length; i += 500) await this.db.q.insert(bookPages).values(rows.slice(i, i + 500));
    return rows.length;
  }

  private async embed(componentId: string) {
    const { rows } = await this.db.q.execute(sql`SELECT id, text_content FROM book_pages WHERE component_id = ${componentId} AND length(text_content) > 20 ORDER BY page_number`);
    for (let i = 0; i < rows.length; i += 32) {
      const batch = rows.slice(i, i + 32) as any[];
      const vecs = await this.ai.provider.embed!(batch.map((r) => r.text_content.slice(0, 4000)));
      for (const [j, v] of vecs.entries()) await this.db.q.execute(sql`UPDATE book_pages SET embedding = ${`[${v.join(',')}]`}::vector WHERE id = ${batch[j].id}`);
    }
  }

  /** Status of every part of an edition. */
  status(editionId: string) {
    return this.db.q.select({ id: bookComponents.id, title: bookComponents.title, hasPdf: sql<boolean>`${bookComponents.bookAssetId} IS NOT NULL`,
      indexStatus: bookComponents.indexStatus, indexedPages: bookComponents.indexedPages, indexedAt: bookComponents.indexedAt, indexError: bookComponents.indexError })
      .from(bookComponents).where(and(eq(bookComponents.editionId, editionId)));
  }
}
