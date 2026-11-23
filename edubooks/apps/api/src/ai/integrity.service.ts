import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { LmsService } from '../lms/lms.service';
import { AiProviderService } from './provider.service';
import { parseJson } from './tasks';

const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\+?\d[\d\s-]{7,}\d/g, '[number]');

/**
 * After a student hands in, the school's AI model (when one is connected and the month's limit allows) estimates how
 * likely each longer written answer was produced by an AI tool. One request per hand-in. Only teachers see the result.
 * No names are sent — only the questions, the answers and the grade.
 */
@Injectable()
export class IntegrityService implements OnModuleInit {
  private readonly log = new Logger('AnswerCheck');
  constructor(private readonly db: DbService, private readonly lms: LmsService, private readonly providers: AiProviderService) {}
  onModuleInit() {
    this.lms.afterSubmit.push(async (id) => {
      const ctx = { ...this.db.ctx };
      // wait until the hand-in is saved, then check in the background
      // the hand-in may still be saving: try again a few times until it is there
      const run = (tries: number) => setTimeout(() => {
        this.db.detached(ctx, () => this.check(id)).then((r) => { if (r === 'not-saved' && tries > 0) run(tries - 1); })
          .catch((e) => this.log.warn(`check failed: ${e.message}`));
      }, Number(process.env.INTEGRITY_DELAY_MS ?? 1500) + (5 - tries) * 300).unref?.();
      run(5);
    });
  }

  async check(submissionId: string) {
    const q = this.db.q;
    const { rows: [s] } = await q.execute(sql`SELECT s.id, s.answers, s.integrity, s.assessment_id AS "assessmentId" FROM submissions s WHERE s.id = ${submissionId}`) as any;
    if (!s || !s.integrity?.items) return 'not-saved';
    const items = s.integrity.items;
    const ids = Object.keys(items).filter((k) => items[k].length >= 60).slice(0, 10);
    if (!ids.length) return 'nothing';
    const provider = await this.providers.current();
    if (!provider.live) return 'no-ai';
    const limit = await this.providers.monthlyLimit();
    const { rows: [u] } = await q.execute(sql`SELECT count(*)::int AS n FROM ai_generations WHERE school_id = ${this.db.ctx.schoolId} AND created_at >= date_trunc('month', now())`) as any;
    if (u.n >= limit) return 'limit';
    const { rows: qs } = await q.execute(sql`SELECT id, prompt FROM assessment_items WHERE id = ANY(${`{${ids.join(',')}}`}::uuid[])`) as any;
    const list = ids.map((id, n) => ({ n: n + 1, id, question: scrub(String(qs.find((x: any) => x.id === id)?.prompt ?? '')).slice(0, 400),
      answer: scrub(String((s.answers as any[]).find((x) => x.itemId === id)?.response ?? '')).slice(0, 1500) }));
    const grade = s.integrity?.grade;
    const system = ['You help teachers check homework. For each student answer, estimate how likely it was written by an AI tool (like ChatGPT) instead of by the student.',
      `The students are ${grade === null || grade === undefined ? 'school children' : grade === 0 ? 'in kindergarten (about 4–6 years old)' : `in grade ${grade} (about ${grade + 5}–${grade + 6} years old)`}.`,
      'Think about: is the vocabulary, sentence length and structure normal for this age? Typical AI style (polished, generic, balanced, "Furthermore", summaries, lists)? Spelling mistakes and simple sentences point to the child.',
      'Answer ONLY with JSON: {"answers":[{"n":1,"score":0-100,"reason":"one short sentence"}]}. score is the likelihood in percent. Be careful: a good answer by a bright child is not AI.'].join('\n');
    const user = list.map((x) => `Answer ${x.n}\nQuestion: ${x.question}\nStudent answer: ${x.answer}`).join('\n\n');
    const started = Date.now();
    const res = await provider.generate({ system, user, maxTokens: 600, json: true });
    await q.execute(sql`INSERT INTO ai_generations (publisher_id, school_id, user_id, task, provider, model, params, sources, grounded, output, status, input_tokens, output_tokens, latency_ms)
      VALUES (${this.db.ctx.publisherId}, ${this.db.ctx.schoolId}, ${this.db.ctx.userId}, 'ANSWER_CHECK', ${provider.name}, ${res.model ?? provider.model}, ${JSON.stringify({ answers: list.length })}::jsonb, '[]'::jsonb, false, null, 'OK', ${res.inputTokens ?? 0}, ${res.outputTokens ?? 0}, ${Date.now() - started})`);
    const out = parseJson(res.text);
    const next = { ...items };
    for (const a of Array.isArray(out?.answers) ? out.answers : []) {
      const it = list.find((x) => x.n === Number(a?.n)); if (!it) continue;
      const score = Math.max(0, Math.min(100, Math.round(Number(a.score) || 0)));
      next[it.id] = { ...next[it.id], ai: { score, reasons: [String(a.reason ?? '').slice(0, 200)].filter(Boolean), by: 'ai', rules: next[it.id].ai } };
    }
    await q.execute(sql`UPDATE submissions SET integrity = jsonb_set(integrity, '{items}', ${JSON.stringify(next)}::jsonb) WHERE id = ${submissionId}`);
    return 'checked';
  }
}
