import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { config } from '../config';
import { Source } from './tasks';
import { AiProviderService } from './provider.service';

/**
 * Finds the textbook pages that ground a request: first the pages of the chosen lesson (or unit),
 * then the best matching pages elsewhere in the same edition (semantic search when embeddings exist,
 * otherwise PostgreSQL full-text search).
 */
@Injectable()
export class RetrievalService {
  constructor(private readonly db: DbService, private readonly ai: AiProviderService) {}

  async sources(o: { editionId: string; lessonId?: string | null; unitId?: string | null; query: string }): Promise<(Source & { componentId: string; lessonId: string | null })[]> {
    const budget = config.ai.maxSourceChars;
    const picked: any[] = [];
    if (o.lessonId || o.unitId) {
      const { rows } = await this.db.q.execute(sql`SELECT p.id, p.page_number AS page, p.text_content AS text, p.lesson_id AS "lessonId", c.id AS "componentId", c.title AS component,
          l.title AS lesson
        FROM book_pages p JOIN book_components c ON c.id = p.component_id LEFT JOIN book_lessons l ON l.id = p.lesson_id
        WHERE c.edition_id = ${o.editionId} AND length(p.text_content) > 20 AND ${o.lessonId ? sql`p.lesson_id = ${o.lessonId}` : sql`l.unit_id = ${o.unitId}`}
        ORDER BY c.sort, p.page_number LIMIT 12`);
      picked.push(...rows);
    }
    const terms = [...new Set(o.query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))].slice(0, 12);
    let extra: any[] = [];
    const exclude = picked.map((p) => p.id);
    const notIn = exclude.length ? sql`AND p.id NOT IN ${exclude}` : sql``;
    if (this.ai.embeddingsEnabled && o.query.trim()) {
      try {
        const [v] = await this.ai.provider.embed!([o.query.slice(0, 2000)]);
        const { rows } = await this.db.q.execute(sql`SELECT p.id, p.page_number AS page, p.text_content AS text, p.lesson_id AS "lessonId", c.id AS "componentId", c.title AS component, l.title AS lesson
          FROM book_pages p JOIN book_components c ON c.id = p.component_id LEFT JOIN book_lessons l ON l.id = p.lesson_id
          WHERE c.edition_id = ${o.editionId} AND p.embedding IS NOT NULL ${notIn}
          ORDER BY p.embedding <=> ${`[${v.join(',')}]`}::vector LIMIT 4`);
        extra = rows;
      } catch { /* fall back to full-text search */ }
    }
    if (!extra.length && terms.length) {
      const q = terms.map((t) => t.replace(/'/g, '')).join(' | ');
      const { rows } = await this.db.q.execute(sql`SELECT p.id, p.page_number AS page, p.text_content AS text, p.lesson_id AS "lessonId", c.id AS "componentId", c.title AS component, l.title AS lesson
        FROM book_pages p JOIN book_components c ON c.id = p.component_id LEFT JOIN book_lessons l ON l.id = p.lesson_id
        WHERE c.edition_id = ${o.editionId} AND p.tsv @@ to_tsquery('simple', ${q}) ${notIn}
        ORDER BY ts_rank(p.tsv, to_tsquery('simple', ${q})) DESC, p.page_number LIMIT 4`);
      extra = rows;
    }
    const out: any[] = []; let used = 0;
    for (const r of [...picked, ...extra]) {
      const text = String(r.text).slice(0, 2500);
      if (used + text.length > budget) break;
      used += text.length;
      out.push({ n: out.length + 1, page: r.page, text, component: r.component, componentId: r.componentId, lessonId: r.lessonId, lesson: r.lesson });
    }
    return out;
  }
}
