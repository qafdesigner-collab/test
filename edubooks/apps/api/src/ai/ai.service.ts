import { ocrAvailable } from './ocr';
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { aiGenerations, bookComponents, bookEditions, bookLessons, bookPackages, bookUnits, grades, subjects } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../lms/access.service';
import { LmsService, cleanItem } from '../lms/lms.service';
import { config } from '../config';
import { AiProviderService } from './provider.service';
import { RetrievalService } from './retrieval.service';
import { buildPrompt, Context, normalise, parseJson, Task, TASKS } from './tasks';
import { offlineDraft } from './offline';
import { AiUnavailableError } from './providers/types';

export interface GenerateInput {
  task: Task; editionId: string; lessonId?: string | null; unitId?: string | null;
  durationMin?: number; difficulty?: 'EASY' | 'MEDIUM' | 'HARD'; count?: number; notes?: string;
}

/** Removes contact details a teacher might paste by accident — children's data never goes to a model. */
const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email removed]').replace(/\+?\d[\d\s-]{7,}\d/g, '[number removed]').slice(0, 500);

@Injectable()
export class AiService {
  private readonly log = new Logger('AI');
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly access: AccessService, private readonly lms: LmsService,
    private readonly providers: AiProviderService, private readonly retrieval: RetrievalService) {}
  private get q() { return this.db.q; }
  private get ctx() { return this.db.ctx; }

  async usedThisMonth(schoolId = this.ctx.schoolId!) {
    const { rows } = await this.q.execute(sql`SELECT count(*)::int AS n FROM ai_generations WHERE school_id = ${schoolId} AND created_at >= date_trunc('month', now())`);
    return (rows[0] as any).n as number;
  }

  async status() {
    const p = this.providers.provider;
    return {
      provider: p.name, model: p.model, live: p.live, embeddings: this.providers.embeddingsEnabled, ocr: (await ocrAvailable()).ok, health: await this.providers.health(),
      tasks: Object.entries(TASKS).map(([id, t]) => ({ id, label: t.label, kind: t.kind })),
      ...(this.ctx.schoolId ? { usedThisMonth: await this.usedThisMonth(), monthlyLimit: config.ai.monthlyRequestsPerSchool } : {}),
    };
  }

  /** Book / part / unit / lesson metadata the prompt is built from (only licensed books). */
  private async lessonContext(i: GenerateInput) {
    await this.access.assertEdition(i.editionId);
    const [ed] = await this.q.select({ title: bookPackages.title, grade: grades.name, subject: subjects.name }).from(bookEditions)
      .innerJoin(bookPackages, eq(bookPackages.id, bookEditions.packageId)).innerJoin(grades, eq(grades.id, bookPackages.gradeId)).innerJoin(subjects, eq(subjects.id, bookPackages.subjectId))
      .where(eq(bookEditions.id, i.editionId));
    if (!ed) throw new NotFoundException('Book not found');
    let part: string | null = null; let unit: string | null = null; let lesson: string | null = null; let objectives: string | null = null; let pages: string | null = null;
    let unitId = i.unitId ?? null;
    if (i.lessonId) {
      const [l] = await this.q.select({ l: bookLessons, u: bookUnits, c: bookComponents }).from(bookLessons).innerJoin(bookUnits, eq(bookUnits.id, bookLessons.unitId))
        .innerJoin(bookComponents, eq(bookComponents.id, bookUnits.componentId)).where(eq(bookLessons.id, i.lessonId));
      if (!l || l.c.editionId !== i.editionId) throw new BadRequestException('That lesson is not in this book');
      part = l.c.title; unit = `Unit ${l.u.number}: ${l.u.title}`; lesson = `Lesson ${l.l.number}: ${l.l.title}`; objectives = l.l.objectives || null; unitId = l.u.id;
      pages = l.l.pageStart ? `${l.l.pageStart}–${l.l.pageEnd ?? l.l.pageStart}` : null;
    } else if (unitId) {
      const [u] = await this.q.select({ u: bookUnits, c: bookComponents }).from(bookUnits).innerJoin(bookComponents, eq(bookComponents.id, bookUnits.componentId)).where(eq(bookUnits.id, unitId));
      if (!u || u.c.editionId !== i.editionId) throw new BadRequestException('That unit is not in this book');
      part = u.c.title; unit = `Unit ${u.u.number}: ${u.u.title}`; objectives = u.u.description || null;
    }
    return { book: ed.title, grade: ed.grade, subject: ed.subject, part, unit, lesson, objectives, pages, unitId };
  }

  async generate(i: GenerateInput) {
    if (!TASKS[i.task]) throw new BadRequestException('Unknown task');
    const used = await this.usedThisMonth();
    if (used >= config.ai.monthlyRequestsPerSchool) throw new HttpException(`Your school has used its ${config.ai.monthlyRequestsPerSchool} AI requests for this month.`, HttpStatus.TOO_MANY_REQUESTS);
    const meta = await this.lessonContext(i);
    const notes = scrub(i.notes ?? '');
    const sources = await this.retrieval.sources({ editionId: i.editionId, lessonId: i.lessonId, unitId: meta.unitId, query: [meta.lesson, meta.unit, meta.objectives, notes].filter(Boolean).join(' ') });
    const ctx: Context = { task: i.task, ...meta, durationMin: i.durationMin ?? 40, difficulty: i.difficulty ?? 'EASY', count: Math.min(i.count ?? 5, 20), notes, sources };
    const provider = this.providers.provider;
    const started = Date.now();
    const tenant = { ...this.ctx };
    const record = async (v: { status: string; output?: any; error?: string; inputTokens?: number; outputTokens?: number; model?: string }) => {
      // Failed attempts end the request with an error (rolling its transaction back), so they are written
      // in their own transaction — every request is logged and counts towards the quota.
      const write = () => this.q.insert(aiGenerations).values({
        publisherId: this.ctx.publisherId, schoolId: this.ctx.schoolId!, userId: this.ctx.userId, task: i.task, editionId: i.editionId, lessonId: i.lessonId ?? null,
        provider: provider.name, model: v.model ?? provider.model, params: { durationMin: ctx.durationMin, difficulty: ctx.difficulty, count: ctx.count, notes, unitId: meta.unitId },
        sources: sources.map(({ n, page, component, componentId, lessonId }) => ({ n, page, component, componentId, lessonId })), grounded: sources.length > 0,
        output: v.output ?? null, status: v.status, error: v.error ?? null, inputTokens: v.inputTokens ?? 0, outputTokens: v.outputTokens ?? 0, latencyMs: Date.now() - started,
      }).returning({ id: aiGenerations.id });
      const [row] = v.status === 'OK' ? await write() : await this.db.detached(tenant, write);
      return row.id;
    };

    let raw: any; let tokens = { inputTokens: 0, outputTokens: 0 }; let model = provider.model;
    if (!provider.live) {
      raw = offlineDraft(ctx);
    } else {
      const prompt = buildPrompt(ctx);
      let lastError = '';
      for (let attempt = 0; attempt < 2 && raw === undefined; attempt++) {
        let res;
        try {
          res = await provider.generate({ system: prompt.system, user: attempt ? `${prompt.user}\n\nYour previous answer could not be used (${lastError}). Reply with valid JSON only.` : prompt.user, maxTokens: 4000, json: true });
        } catch (e: any) {
          const msg = e instanceof AiUnavailableError ? e.message : 'The AI service failed';
          await this.record503(record, msg);
          throw new ServiceUnavailableException(msg);
        }
        tokens = { inputTokens: tokens.inputTokens + res.inputTokens, outputTokens: tokens.outputTokens + res.outputTokens }; model = res.model;
        if (res.refused) { await record({ status: 'REFUSED', ...tokens, model }); throw new UnprocessableEntityException('The AI declined this request. Try rephrasing your notes.'); }
        try { raw = normalise(i.task, parseJson(res.text), sources); } catch (e: any) { lastError = e.message; }
      }
      if (raw === undefined) {
        await record({ status: 'INVALID', error: lastError, ...tokens, model });
        throw new UnprocessableEntityException(`The AI answer could not be used (${lastError}). Please try again.`);
      }
    }
    const { output, warnings } = provider.live ? raw : normalise(i.task, raw, sources);
    if (!provider.live) warnings.unshift('Offline draft: no AI model is configured, so this was assembled from the lesson data only.');
    const id = await record({ status: 'OK', output, ...tokens, model });
    return {
      id, task: i.task, provider: provider.name, model, live: provider.live, grounded: sources.length > 0, output, warnings,
      sources: sources.map((s) => ({ n: s.n, page: s.page, component: s.component, componentId: s.componentId, lesson: s.lesson, snippet: s.text.slice(0, 220) })),
      usage: { ...tokens, usedThisMonth: used + 1, monthlyLimit: config.ai.monthlyRequestsPerSchool },
    };
  }
  private async record503(record: (v: any) => Promise<string>, msg: string) { await record({ status: 'ERROR', error: msg }).catch(() => undefined); }

  async history() {
    return this.q.select({ id: aiGenerations.id, task: aiGenerations.task, status: aiGenerations.status, grounded: aiGenerations.grounded, usedAs: aiGenerations.usedAs,
      createdAt: aiGenerations.createdAt, provider: aiGenerations.provider, model: aiGenerations.model,
      title: sql<string | null>`${aiGenerations.output}->>'title'`,
      lesson: sql<string | null>`(SELECT 'Lesson ' || l.number || ': ' || l.title FROM book_lessons l WHERE l.id = ${aiGenerations.lessonId})` })
      .from(aiGenerations).where(eq(aiGenerations.userId, this.ctx.userId)).orderBy(desc(aiGenerations.createdAt)).limit(50);
  }

  async get(id: string) {
    const [g] = await this.q.select().from(aiGenerations).where(and(eq(aiGenerations.id, id), eq(aiGenerations.userId, this.ctx.userId)));
    if (!g) throw new NotFoundException('Not found');
    return g;
  }

  /**
   * Teacher approval: the (possibly edited) draft becomes a lesson plan, a DRAFT assessment or question-bank entries.
   * Nothing generated by AI ever reaches students without the teacher publishing it.
   */
  async use(id: string, d: { as: 'LESSON_PLAN' | 'ASSESSMENT' | 'QUESTION_BANK'; classId?: string; output?: any; title?: string }) {
    const g = await this.get(id);
    if (g.status !== 'OK') throw new BadRequestException('Only successful drafts can be used');
    const kind = TASKS[g.task as Task].kind;
    const out = d.output ?? g.output;
    let usedId: string;
    if (d.as === 'LESSON_PLAN') {
      const content = kind === 'plan' ? { objectives: out.objectives, materials: out.materials, warmUp: out.warmUp, steps: (out.steps ?? []).map((s: any) => ({ title: s.title, minutes: s.minutes, detail: s.detail })),
        practice: out.practice, assessment: out.assessment, homework: out.homework, differentiation: out.differentiation, notes: out.notes }
        : kind === 'sections' ? { notes: (out.sections ?? []).map((s: any) => `${s.heading}${s.minutes ? ` (${s.minutes} min)` : ''}\n${s.body}`).join('\n\n') }
          : { assessment: (out.items ?? []).map((it: any, n: number) => `${n + 1}. ${it.prompt}`).join('\n') };
      const plan = await this.lms.savePlan(null, { title: (d.title || out.title || 'AI lesson plan').slice(0, 200), classId: d.classId ?? null, editionId: g.editionId, lessonId: g.lessonId,
        durationMin: (g.params as any).durationMin ?? 40, content, aiGenerated: true, status: 'DRAFT' });
      usedId = plan.id;
    } else {
      if (kind !== 'items') throw new BadRequestException('Only question drafts can become homework or bank questions');
      const items = (out.items ?? []).map((it: any, n: number) => cleanItem(it, n + 1));
      if (!items.length) throw new BadRequestException('There are no questions to use');
      if (d.as === 'ASSESSMENT') {
        if (!d.classId) throw new BadRequestException('Choose the class');
        const a = await this.lms.createAssessment({ classId: d.classId, kind: g.task === 'ASSESSMENT' ? 'TEST' : g.task === 'HOMEWORK' || g.task === 'WORKSHEET' ? 'HOMEWORK' : 'QUIZ',
          title: (d.title || out.title || 'AI questions').slice(0, 200), instructions: out.instructions ?? '', editionId: g.editionId, unitId: (g.params as any).unitId ?? null, lessonId: g.lessonId, items });
        usedId = a.id;
      } else {
        for (const it of items) await this.lms.addQuestion({ ...it, editionId: g.editionId, lessonId: g.lessonId, shared: true });
        usedId = g.id;
      }
    }
    await this.q.update(aiGenerations).set({ usedAs: d.as, usedId, output: out }).where(eq(aiGenerations.id, id));
    await this.audit.log('ai.use', 'ai_generation', id, `Approved an AI ${TASKS[g.task as Task].label.toLowerCase()} draft as ${d.as.toLowerCase().replace('_', ' ')}`);
    return { usedAs: d.as, id: usedId };
  }

  /** Usage report. Publisher staff: all schools. School admins: their school. */
  async usage() {
    const scope = this.ctx.staff ? sql`TRUE` : sql`g.school_id = ${this.ctx.schoolId}`;
    const { rows: byMonth } = await this.q.execute(sql`SELECT to_char(date_trunc('month', g.created_at), 'YYYY-MM') AS month, s.name AS school, s.code,
        count(*)::int AS requests, count(*) FILTER (WHERE g.status = 'OK')::int AS ok, count(*) FILTER (WHERE g.used_as IS NOT NULL)::int AS approved,
        count(*) FILTER (WHERE g.grounded)::int AS grounded, sum(g.input_tokens)::int AS "inputTokens", sum(g.output_tokens)::int AS "outputTokens", round(avg(g.latency_ms))::int AS "avgLatencyMs"
      FROM ai_generations g JOIN schools s ON s.id = g.school_id WHERE ${scope}
      GROUP BY 1, s.name, s.code ORDER BY 1 DESC, requests DESC LIMIT 500`);
    const { rows: byTask } = await this.q.execute(sql`SELECT g.task, count(*)::int AS requests FROM ai_generations g WHERE ${scope} AND g.created_at >= date_trunc('month', now()) GROUP BY 1 ORDER BY 2 DESC`);
    const cost = (r: any) => ((r.inputTokens ?? 0) * config.ai.costInPerM + (r.outputTokens ?? 0) * config.ai.costOutPerM) / 1e6;
    return { byMonth: byMonth.map((r: any) => ({ ...r, estimatedCost: config.ai.costInPerM || config.ai.costOutPerM ? Math.round(cost(r) * 100) / 100 : null })), byTask, monthlyLimitPerSchool: config.ai.monthlyRequestsPerSchool };
  }
}
