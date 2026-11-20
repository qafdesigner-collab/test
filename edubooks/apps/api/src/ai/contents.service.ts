import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AiProviderService } from './provider.service';
import { Contents, FoundUnit, fromHeadings, headOf, tidy } from './contents';
import { parseJson } from './tasks';

/**
 * The contents (index) of a book part, found from its pages: where each unit and lesson begins.
 * A part with no units yet gets them automatically; otherwise the publisher sees them as a suggestion.
 * Allowed on published editions too: it only adds what is missing and fills empty page numbers, never changes what is there.
 */
@Injectable()
export class ContentsService {
  private readonly log = new Logger('BookContents');
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly ai: AiProviderService) {}

  private async rows(q: any) { return (await this.db.q.execute(q)).rows as any[]; }

  async detect(componentId: string, useAi = true): Promise<Contents> {
    const [c] = await this.rows(sql`SELECT id, title, page_count AS "pageCount" FROM book_components WHERE id = ${componentId}`);
    if (!c) throw new NotFoundException('Book part not found');
    const pages = (await this.rows(sql`SELECT page_number AS page, text_content AS text FROM book_pages WHERE component_id = ${componentId} AND length(text_content) > 0 ORDER BY page_number`))
      .map((p) => ({ page: Number(p.page), text: String(p.text) }));
    if (!pages.length) throw new BadRequestException('This part has no page text yet. Upload its PDF or flipbook and wait until it has been read (with OCR for picture pages).');
    const last = Math.max(c.pageCount ?? 0, ...pages.map((p) => p.page));
    const headings = tidy(fromHeadings(pages, c.title), last);
    let units: FoundUnit[] = headings; let source: Contents['source'] = 'HEADINGS';
    const provider = useAi ? await this.ai.current().catch(() => null) : null;
    if (provider?.live) {
      const per = pages.length > 160 ? 90 : 160;
      const list = pages.slice(0, 320).map((p) => `p${p.page}: ${headOf(p.text, per)}`).join('\n');
      const system = 'You find the table of contents of a school book from the first lines of each of its pages. Reply with JSON only.';
      const user = `BOOK PART: "${c.title}" (${last} pages)\nFIRST LINES OF EACH PAGE:\n${list}\n\n`
        + 'TASK: Find where each unit (or chapter / module / theme) and each lesson (or topic) BEGINS. "page" is the page number where it begins. '
        + 'Use only page numbers from the list. Ignore a contents/index page that just lists them. If there are lessons but no units, put them in one unit titled with the book part name. '
        + 'Use the titles printed in the book. If you find nothing, return {"units": []}.\n'
        + 'Reply as JSON: {"units": [{"number": 1, "title": string, "page": number, "lessons": [{"number": 1, "title": string, "page": number}]}]}';
      try {
        const res = await provider.generate({ system, user, maxTokens: 3000, json: true });
        const j = parseJson(res.text) as any;
        const fromAi = tidy((Array.isArray(j?.units) ? j.units : []).map((u: any) => ({ number: Number(u.number), title: String(u.title ?? '').trim(), page: Number(u.page),
          lessons: (Array.isArray(u.lessons) ? u.lessons : []).map((l: any) => ({ number: Number(l.number), title: String(l.title ?? '').trim(), page: Number(l.page) })) })), last);
        // the AI's answer must agree with the pages: each unit's start page should mention it, or the headings found nothing
        if (fromAi.length && (fromAi.length >= headings.length || !headings.length)) { units = fromAi; source = 'AI'; }
      } catch (e: any) { this.log.warn(`AI contents for ${componentId} not used: ${e.message}`); }
    }
    return { source, units, foundAt: new Date().toISOString() };
  }

  /** Adds the found units / lessons that are missing and fills empty page numbers. */
  async apply(componentId: string, found?: Contents) {
    const [c] = await this.rows(sql`SELECT c.id, c.title, c.publisher_id AS pub, c.contents_suggestion AS s, e.status AS "edStatus", b.status AS "pkgStatus"
      FROM book_components c JOIN book_editions e ON e.id = c.edition_id JOIN book_packages b ON b.id = e.package_id WHERE c.id = ${componentId}`);
    if (!c) throw new NotFoundException('Book part not found');
    if (c.edStatus === 'ARCHIVED' || c.pkgStatus === 'ARCHIVED') throw new ConflictException('This edition is archived and read-only.');
    const s: Contents | null = found ?? c.s;
    if (!s?.units?.length) throw new BadRequestException('No contents were found for this part yet.');
    const existing = await this.rows(sql`SELECT id, number, sort FROM book_units WHERE component_id = ${componentId}`);
    let unitsAdded = 0, lessonsAdded = 0, pagesSet = 0; let sort = Math.max(-1, ...existing.map((u) => Number(u.sort)));
    for (const u of s.units) {
      let unit = existing.find((x) => Number(x.number) === u.number);
      if (!unit) {
        [unit] = await this.rows(sql`INSERT INTO book_units (publisher_id, component_id, number, title, sort) VALUES (${c.pub}, ${componentId}, ${u.number}, ${u.title}, ${++sort}) RETURNING id, number`);
        existing.push(unit); unitsAdded++;
      }
      const lessons = await this.rows(sql`SELECT id, number, page_start AS "pageStart", sort FROM book_lessons WHERE unit_id = ${unit.id}`);
      let ls = Math.max(-1, ...lessons.map((l) => Number(l.sort)));
      for (const l of u.lessons) {
        const have = lessons.find((x) => Number(x.number) === l.number);
        if (!have) {
          await this.db.q.execute(sql`INSERT INTO book_lessons (publisher_id, unit_id, number, title, page_start, page_end, sort) VALUES (${c.pub}, ${unit.id}, ${l.number}, ${l.title}, ${l.page}, ${l.pageEnd ?? l.page}, ${++ls})`);
          lessonsAdded++;
        } else if (have.pageStart == null) {
          await this.db.q.execute(sql`UPDATE book_lessons SET page_start = ${l.page}, page_end = ${l.pageEnd ?? l.page} WHERE id = ${have.id}`); pagesSet++;
        }
      }
    }
    // each page now knows its lesson (used by the AI assistant and the reader)
    await this.db.q.execute(sql`UPDATE book_pages bp SET lesson_id = l.id FROM book_lessons l JOIN book_units u ON u.id = l.unit_id
      WHERE u.component_id = ${componentId} AND bp.component_id = ${componentId} AND bp.lesson_id IS NULL AND l.page_start IS NOT NULL AND bp.page_number BETWEEN l.page_start AND coalesce(l.page_end, l.page_start)`);
    const result = `${unitsAdded} unit(s) and ${lessonsAdded} lesson(s) added, ${pagesSet} lesson page(s) filled in`;
    await this.db.q.execute(sql`UPDATE book_components SET contents_suggestion = ${JSON.stringify({ ...s, applied: true, result })}::jsonb WHERE id = ${componentId}`);
    await this.audit.log('publishing.contents.apply', 'book_component', componentId, `Contents of “${c.title}” from its pages (${s.source === 'AI' ? 'AI' : 'headings'}): ${result}`);
    return { unitsAdded, lessonsAdded, pagesSet };
  }

  async save(componentId: string, found: Contents) {
    await this.db.q.execute(sql`UPDATE book_components SET contents_suggestion = ${JSON.stringify(found)}::jsonb WHERE id = ${componentId}`);
    return found;
  }

  async dismiss(componentId: string) {
    await this.db.q.execute(sql`UPDATE book_components SET contents_suggestion = NULL WHERE id = ${componentId}`);
    return { ok: true };
  }

  /** After a part's pages have been read: find its contents; a part without units gets them straight away. */
  async auto(componentId: string) {
    try {
      const found = await this.detect(componentId);
      if (!found.units.length) return;
      const [{ n }] = await this.rows(sql`SELECT count(*)::int AS n FROM book_units WHERE component_id = ${componentId}`);
      await this.save(componentId, found);
      if (!n) await this.apply(componentId, found);
      this.log.log(`contents of ${componentId}: ${found.units.length} unit(s) found (${found.source})${n ? ' — saved as a suggestion' : ' — added'}`);
    } catch (e: any) { this.log.warn(`contents of ${componentId} not found: ${e.message}`); }
  }
}
