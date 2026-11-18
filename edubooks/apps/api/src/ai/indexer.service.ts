import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { pipeline } from 'stream/promises';
import { DbService, TenantCtx } from '../db/db.service';
import { bookComponents, bookLessons, bookPages, bookUnits, digitalAssets, flipbookFiles, flipbooks } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { extractPdfPages } from './extract';
import { ocrAvailable, ocrImageFiles, ocrPages } from './ocr';
import { detectFlipPages } from '../flipbook/flip-pages';
import { AiProviderService } from './provider.service';
import { appTmp } from '../common/tmp';

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
    if (!c) throw new NotFoundException('Book part not found');
    if (!c.bookAssetId) return this.runFlipbook(c); // no PDF: read the page pictures of its HTML5 flipbook
    const [asset] = await this.db.q.select().from(digitalAssets).where(eq(digitalAssets.id, c.bookAssetId));
    const tmp = path.join(appTmp(), `idx-${randomBytes(8).toString('hex')}.pdf`);
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

  /**
   * Automatic OCR of chosen pages: pages that have no text yet (pictures / scanned pages, or a book that was never
   * indexed) are read now, before the AI uses them. Runs with the publisher's rights, writing only the pages' text.
   */
  async ensurePageText(componentId: string, numbers: number[]): Promise<{ read: number; missing: number[]; ocr: boolean }> {
    const ctx = { ...this.db.ctx, staff: true };
    return this.db.detached(ctx, async () => {
      const [c] = await this.db.q.select().from(bookComponents).where(eq(bookComponents.id, componentId));
      if (!c || !numbers.length) return { read: 0, missing: [], ocr: true };
      const { rows } = await this.db.q.execute(sql`SELECT page_number FROM book_pages WHERE component_id = ${componentId} AND page_number IN ${numbers} AND length(text_content) > 20`);
      const have = new Set((rows as any[]).map((r) => r.page_number));
      const missing = numbers.filter((n) => !have.has(n)).slice(0, 30);
      if (!missing.length) return { read: 0, missing: [], ocr: true };
      const ocr = await ocrAvailable();
      if (!ocr.ok) return { read: 0, missing, ocr: false };
      let found = new Map<number, string>();
      const dir = await fs.promises.mkdtemp(path.join(appTmp(), 'ocrnow-'));
      try {
        if (c.bookAssetId) {
          const [asset] = await this.db.q.select().from(digitalAssets).where(eq(digitalAssets.id, c.bookAssetId));
          const pdf = path.join(dir, 'book.pdf');
          await pipeline(await this.assets.driver.read(asset.storageKey), fs.createWriteStream(pdf));
          found = await ocrPages(pdf, missing);
        } else {
          const fbs = (await this.db.q.select().from(flipbooks).where(eq(flipbooks.componentId, componentId))).filter((f) => f.kind === 'HTML');
          for (const f of fbs) {
            const files = await this.db.q.select({ path: flipbookFiles.path }).from(flipbookFiles).where(eq(flipbookFiles.flipbookId, f.id));
            const pages = detectFlipPages(files.map((x) => x.path)).filter((p) => missing.includes(p.n)); if (!pages.length) continue;
            const local: { n: number; file: string }[] = [];
            for (const p of pages) { const file = path.join(dir, `${p.n}${path.extname(p.path) || '.jpg'}`); await pipeline(await this.assets.driver.read(`${f.storagePrefix}/${p.path}`), fs.createWriteStream(file)); local.push({ n: p.n, file }); }
            found = await ocrImageFiles(local); break;
          }
        }
      } finally { await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined); }
      const lessons = await this.db.q.select({ id: bookLessons.id, a: bookLessons.pageStart, b: bookLessons.pageEnd }).from(bookLessons)
        .innerJoin(bookUnits, eq(bookUnits.id, bookLessons.unitId)).where(eq(bookUnits.componentId, componentId));
      let read = 0;
      for (const [n, text] of found) {
        if (text.trim().length <= 20) continue; read++;
        const l = lessons.find((x) => x.a && n >= x.a && n <= (x.b ?? x.a));
        await this.db.q.execute(sql`INSERT INTO book_pages (publisher_id, component_id, page_number, text_content, lesson_id) VALUES (${c.publisherId}, ${componentId}, ${n}, ${text.slice(0, 20_000)}, ${l?.id ?? null})
          ON CONFLICT (component_id, page_number) DO UPDATE SET text_content = EXCLUDED.text_content WHERE length(book_pages.text_content) <= 20`);
      }
      if (read) {
        await this.db.q.execute(sql`UPDATE book_components SET indexed_pages = (SELECT count(*) FROM book_pages WHERE component_id = ${componentId} AND length(text_content) > 20),
          index_status = 'DONE', index_error = NULL, indexed_at = now() WHERE id = ${componentId}`);
        this.log.log(`OCR on demand: ${read} page(s) of “${c.title}”`);
      }
      return { read, missing: missing.filter((n) => (found.get(n)?.trim().length ?? 0) <= 20), ocr: true };
    });
  }

  /** A part with only an HTML5 flipbook: its page pictures are read with OCR (text recognition) into book pages. */
  private async runFlipbook(c: typeof bookComponents.$inferSelect) {
    const fbs = (await this.db.q.select().from(flipbooks).where(eq(flipbooks.componentId, c.id))).filter((f) => f.kind === 'HTML')
      .sort((a, b) => Number(!!a.unitTitle) - Number(!!b.unitTitle) || a.sort - b.sort);
    let found: { f: typeof flipbooks.$inferSelect; pages: { n: number; path: string }[] } | null = null;
    for (const f of fbs) {
      const files = await this.db.q.select({ path: flipbookFiles.path }).from(flipbookFiles).where(eq(flipbookFiles.flipbookId, f.id));
      const pages = detectFlipPages(files.map((x) => x.path)); if (pages.length) { found = { f, pages }; break; }
    }
    if (!found) throw new NotFoundException('This part has no book PDF, and no page pictures were found in its flipbook (a SWF/CD cannot be read). Upload the PDF of this part for the AI.');
    const ocr = await ocrAvailable();
    if (!ocr.ok) throw new Error('Reading flipbook pages needs OCR (tesseract) on the server, which is not installed. Upload the PDF of this part instead.');
    const dir = await fs.promises.mkdtemp(path.join(appTmp(), 'flipocr-'));
    try {
      const local: { n: number; file: string }[] = [];
      for (const p of found.pages) {
        const file = path.join(dir, `${p.n}${path.extname(p.path) || '.jpg'}`);
        await pipeline(await this.assets.driver.read(`${found.f.storagePrefix}/${p.path}`), fs.createWriteStream(file)); local.push({ n: p.n, file });
      }
      const text = await ocrImageFiles(local);
      const max = Math.max(...found.pages.map((p) => p.n));
      const pages = Array.from({ length: max }, (_, i) => text.get(i + 1) ?? '');
      await this.store(c.id, c.publisherId, pages);
      const withText = pages.filter((p) => p.trim().length > 20).length;
      await this.db.q.update(bookComponents).set({ indexStatus: withText ? 'DONE' : 'NO_TEXT', indexedPages: withText, indexedAt: new Date(), pageCount: c.pageCount ?? max,
        indexError: withText ? null : 'No readable text found on the flipbook pages.' }).where(eq(bookComponents.id, c.id));
      await this.audit.log('ai.index', 'book_component', c.id, `Read the flipbook pages of “${c.title}” with OCR for the AI assistant: ${withText} of ${max} pages with text`);
      if (withText && this.ai.embeddingsEnabled) await this.embed(c.id).catch((e) => this.log.warn(`embeddings skipped: ${e.message}`));
    } finally { await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined); }
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
