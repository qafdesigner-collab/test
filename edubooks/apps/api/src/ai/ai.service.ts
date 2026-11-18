import { ocrAvailable } from './ocr';
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { visibleFor } from '../common/visibility';
import { DbService } from '../db/db.service';
import { aiGenerations, bookComponents, bookEditions, bookLessons, bookPackages, bookUnits, grades, subjects } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../lms/access.service';
import { LmsService, cleanItem } from '../lms/lms.service';
import { config } from '../config';
import { AiProviderService } from './provider.service';
import { IndexerService } from './indexer.service';
import { RetrievalService } from './retrieval.service';
import { buildPrompt, Context, normalise, parseJson, Task, TASKS } from './tasks';
import { offlineDraft } from './offline';
import { AiUnavailableError } from './providers/types';

export interface GenerateInput {
  task: Task; editionId: string; lessonId?: string | null; unitId?: string | null;
  /** A book part and pages, e.g. "1-5, 10-15" (instead of a lesson). */
  componentId?: string | null; pages?: string | null;
  durationMin?: number; difficulty?: 'EASY' | 'MEDIUM' | 'HARD'; count?: number; notes?: string;
}

/** Removes contact details a teacher might paste by accident — children's data never goes to a model. */
/** "1-5, 10-15, 20" → [1..5, 10..15, 20]; at most 30 pages. */
export function parsePages(t: string): number[] {
  const out = new Set<number>();
  for (const part of t.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?$/.exec(part);
    if (!m) throw new BadRequestException(`“${part}” is not a page or page range — write pages like 1-5, 10-15`);
    const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < a) throw new BadRequestException(`“${part}” is not a valid page range`);
    for (let p = a; p <= b; p++) { out.add(p); if (out.size > 30) throw new BadRequestException('Choose at most 30 pages at a time'); }
  }
  return [...out].sort((x, y) => x - y);
}
const rangesLabel = (n: number[]) => { const r: string[] = []; for (let i = 0; i < n.length; i++) { let j = i; while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++; r.push(i === j ? `${n[i]}` : `${n[i]}–${n[j]}`); i = j; } return r.join(', '); };

const scrub = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email removed]').replace(/\+?\d[\d\s-]{7,}\d/g, '[number removed]').slice(0, 500);

@Injectable()
export class AiService {
  private readonly log = new Logger('AI');
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly access: AccessService, private readonly lms: LmsService,
    private readonly providers: AiProviderService, private readonly retrieval: RetrievalService, private readonly indexer: IndexerService) {}
  private get q() { return this.db.q; }
  private get ctx() { return this.db.ctx; }

  async usedThisMonth(schoolId = this.ctx.schoolId!) {
    const { rows } = await this.q.execute(sql`SELECT count(*)::int AS n FROM ai_generations WHERE school_id = ${schoolId} AND created_at >= date_trunc('month', now())`);
    return (rows[0] as any).n as number;
  }

  async status() {
    const p = await this.providers.current();
    return {
      provider: p.name, model: p.model, live: p.live, embeddings: this.providers.embeddingsEnabled, ocr: (await ocrAvailable()).ok, ocrLangs: (await ocrAvailable()).langs, health: await this.providers.health(),
      tasks: Object.entries(TASKS).map(([id, t]) => ({ id, label: t.label, kind: t.kind })),
      ...(this.ctx.schoolId ? { usedThisMonth: await this.usedThisMonth(), monthlyLimit: await this.providers.monthlyLimit(), access: (await this.providers.school()).access } : {}),
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
    let unitId = i.unitId ?? null; let pageNumbers: number[] | null = null;
    if (i.lessonId) {
      const [l] = await this.q.select({ l: bookLessons, u: bookUnits, c: bookComponents }).from(bookLessons).innerJoin(bookUnits, eq(bookUnits.id, bookLessons.unitId))
        .innerJoin(bookComponents, eq(bookComponents.id, bookUnits.componentId)).where(eq(bookLessons.id, i.lessonId));
      if (!l || l.c.editionId !== i.editionId) throw new BadRequestException('That lesson is not in this book');
      part = l.c.title; unit = `Unit ${l.u.number}: ${l.u.title}`; lesson = `Lesson ${l.l.number}: ${l.l.title}`; objectives = l.l.objectives || null; unitId = l.u.id;
      pages = l.l.pageStart ? `${l.l.pageStart}–${l.l.pageEnd ?? l.l.pageStart}` : null;
    } else if (i.componentId && i.pages) {
      const [c] = await this.q.select().from(bookComponents).where(eq(bookComponents.id, i.componentId));
      if (!c || c.editionId !== i.editionId) throw new BadRequestException('That part is not in this book');
      const vis = visibleFor(this.ctx); if (vis && !vis.includes(c.visibleTo as any)) throw new BadRequestException('That part is not available to you');
      const nums = parsePages(i.pages); if (!nums.length) throw new BadRequestException('Choose the pages');
      part = c.title; pages = rangesLabel(nums); pageNumbers = nums;
    } else if (unitId) {
      const [u] = await this.q.select({ u: bookUnits, c: bookComponents }).from(bookUnits).innerJoin(bookComponents, eq(bookComponents.id, bookUnits.componentId)).where(eq(bookUnits.id, unitId));
      if (!u || u.c.editionId !== i.editionId) throw new BadRequestException('That unit is not in this book');
      part = u.c.title; unit = `Unit ${u.u.number}: ${u.u.title}`; objectives = u.u.description || null;
    }
    return { book: ed.title, grade: ed.grade, subject: ed.subject, part, unit, lesson, objectives, pages, unitId, pageNumbers };
  }

  /**
   * Teachers' open assistant: any teaching task (research, lesson ideas, question papers, rubrics, letters to
   * parents…), not limited to the book. A book can be added for context. Students never reach this (they only
   * have Ask Owl, which answers from their book and does not do homework).
   */
  async chat(d: { message: string; history?: { role: 'user' | 'assistant'; text: string }[]; editionId?: string }) {
    const used = await this.usedThisMonth();
    const limit = await this.providers.monthlyLimit();
    if (used >= limit) throw new HttpException(`Your school has used its ${limit} AI requests for this month.`, HttpStatus.TOO_MANY_REQUESTS);
    const provider = await this.providers.current();
    if (!provider.live) throw new ServiceUnavailableException(provider.name === 'off' ? 'AI is not switched on for your school. Please ask your school admin or publisher.' : 'No AI service is connected yet. Ask the super admin (or your school admin) to connect one — free plans are available.');
    const message = scrub(d.message).slice(0, 4000);
    let book = ''; let sources: any[] = [];
    if (d.editionId) {
      await this.access.assertEdition(d.editionId);
      const { rows: [ed] } = await this.q.execute(sql`SELECT b.title, g.name AS grade, s.name AS subject FROM book_editions e JOIN book_packages b ON b.id = e.package_id
        LEFT JOIN grades g ON g.id = b.grade_id LEFT JOIN subjects s ON s.id = b.subject_id WHERE e.id = ${d.editionId}`) as any;
      sources = await this.retrieval.sources({ editionId: d.editionId, query: message });
      book = `\n\nThe teacher is working with the book "${ed?.title}" (${[ed?.grade, ed?.subject].filter(Boolean).join(', ')}). Relevant pages from it:\n${sources.map((x) => `[page ${x.page}${x.component ? `, ${x.component}` : ''}] ${x.text.slice(0, 1500)}`).join('\n\n')}\nUse these pages where they help and mention the page numbers you used.`;
    }
    const system = ['You are a helpful, knowledgeable assistant for school teachers (early years and primary).',
      'Help with any teaching work: research and explanations of topics, lesson plans, question papers and answer keys, worksheets, rubrics, activities, differentiation, report comments, letters and messages to parents, classroom management.',
      'Write clearly with headings and lists where useful. Be accurate; if you are not sure about a fact, say so. Keep content suitable for a school.'].join('\n');
    const history = (d.history ?? []).slice(-8).map((h) => `${h.role === 'user' ? 'Teacher' : 'Assistant'}: ${h.text.slice(0, 3000)}`).join('\n\n');
    const user = `${history ? `Conversation so far:\n${history}\n\n` : ''}Teacher: ${message}${book}`;
    const started = Date.now(); const tenant = { ...this.ctx };
    const log = (v: { status: string; text?: string; error?: string; inTok?: number; outTok?: number; model?: string }) => {
      const write = () => this.q.insert(aiGenerations).values({ publisherId: this.ctx.publisherId, schoolId: this.ctx.schoolId!, userId: this.ctx.userId, task: 'CHAT', editionId: d.editionId ?? null,
        provider: provider.name, model: v.model ?? provider.model, params: { message: message.slice(0, 500) }, sources: sources.map(({ n, page, component }) => ({ n, page, component })), grounded: sources.length > 0,
        output: v.text ? { text: v.text } : null, status: v.status, error: v.error ?? null, inputTokens: v.inTok ?? 0, outputTokens: v.outTok ?? 0, latencyMs: Date.now() - started });
      return v.status === 'OK' ? write() : this.db.detached(tenant, write);
    };
    try {
      const res = await provider.generate({ system, user, maxTokens: 3000, json: false });
      if (res.refused) { await log({ status: 'REFUSED' }); throw new UnprocessableEntityException('The AI declined this request. Try asking in a different way.'); }
      const text = res.text.trim();
      await log({ status: 'OK', text, inTok: res.inputTokens, outTok: res.outputTokens, model: res.model });
      return { text, model: res.model, pages: sources.map((x) => x.page), remaining: Math.max(0, limit - used - 1) };
    } catch (e: any) {
      if (e instanceof UnprocessableEntityException) throw e;
      const msg = e instanceof AiUnavailableError ? e.message : 'The AI service failed';
      await log({ status: 'ERROR', error: msg }); throw new ServiceUnavailableException(msg);
    }
  }

  async generate(i: GenerateInput) {
    if (!TASKS[i.task]) throw new BadRequestException('Unknown task');
    const used = await this.usedThisMonth();
    const limit = await this.providers.monthlyLimit();
    if (used >= limit) throw new HttpException(`Your school has used its ${limit} AI requests for this month.`, HttpStatus.TOO_MANY_REQUESTS);
    const meta = await this.lessonContext(i);
    const notes = scrub(i.notes ?? '');
    // automatic OCR: chosen pages without text (pictures, scans, never indexed) are read now
    let ocrNote = '';
    if (meta.pageNumbers && i.componentId) {
      const o = await this.indexer.ensurePageText(i.componentId, meta.pageNumbers);
      if (!o.ocr && o.missing.length === meta.pageNumbers.length) throw new BadRequestException(`Pages ${meta.pages} of ${meta.part} have no text yet, and they could not be read automatically: OCR (text recognition) is not installed on the server. Ask your publisher / host to install “tesseract-ocr” and “poppler-utils”.`);
      if (o.read) ocrNote = `${o.read} page${o.read === 1 ? ' was' : 's were'} read automatically with OCR (text recognition) — check names and spellings in the draft.`;
    }
    const sources = await this.retrieval.sources({ editionId: i.editionId, lessonId: i.lessonId, unitId: meta.unitId, query: [meta.lesson, meta.unit, meta.objectives, notes].filter(Boolean).join(' '),
      pages: meta.pageNumbers && i.componentId ? { componentId: i.componentId, numbers: meta.pageNumbers } : null });
    if (meta.pageNumbers && !sources.length) throw new BadRequestException(`No words were found on pages ${meta.pages} of ${meta.part}, even with OCR — these pages may be pictures without text. Choose other pages, or add notes describing what to teach.`);
    const ctx: Context = { task: i.task, ...meta, durationMin: i.durationMin ?? 40, difficulty: i.difficulty ?? 'EASY', count: Math.min(i.count ?? 5, 20), notes, sources };
    const provider = await this.providers.current();
    const started = Date.now();
    const tenant = { ...this.ctx };
    const record = async (v: { status: string; output?: any; error?: string; inputTokens?: number; outputTokens?: number; model?: string }) => {
      // Failed attempts end the request with an error (rolling its transaction back), so they are written
      // in their own transaction — every request is logged and counts towards the quota.
      const write = () => this.q.insert(aiGenerations).values({
        publisherId: this.ctx.publisherId, schoolId: this.ctx.schoolId!, userId: this.ctx.userId, task: i.task, editionId: i.editionId, lessonId: i.lessonId ?? null,
        provider: provider.name, model: v.model ?? provider.model, params: { durationMin: ctx.durationMin, difficulty: ctx.difficulty, count: ctx.count, notes, unitId: meta.unitId, ...(meta.pageNumbers ? { componentId: i.componentId, pages: meta.pages } : {}) },
        sources: sources.map(({ n, page, component, componentId, lessonId }) => ({ n, page, component, componentId, lessonId })), grounded: sources.length > 0,
        output: v.output ?? null, status: v.status, error: v.error ?? null, inputTokens: v.inputTokens ?? 0, outputTokens: v.outputTokens ?? 0, latencyMs: Date.now() - started,
      }).returning({ id: aiGenerations.id });
      const [row] = v.status === 'OK' ? await write() : await this.db.detached(tenant, write);
      return row.id;
    };

    let raw: any; let tokens = { inputTokens: 0, outputTokens: 0 }; let model = provider.model; let fallback = '';
    if (!provider.live) {
      raw = offlineDraft(ctx);
    } else {
      const prompt = buildPrompt(ctx);
      let lastError = '';
      for (let attempt = 0; attempt < 2 && raw === undefined && !fallback; attempt++) {
        let res;
        try {
          res = await provider.generate({ system: prompt.system, user: attempt ? `${prompt.user}\n\nYour previous answer could not be used (${lastError}). Reply with valid JSON only.` : prompt.user, maxTokens: 4000, json: true });
        } catch (e: any) {
          // the AI service failed (wrong key, busy, blocked…): the teacher still gets an offline draft, with the reason
          fallback = e instanceof AiUnavailableError ? e.message : 'The AI service failed';
          break;
        }
        tokens = { inputTokens: tokens.inputTokens + res.inputTokens, outputTokens: tokens.outputTokens + res.outputTokens }; model = res.model;
        if (res.refused) { await record({ status: 'REFUSED', ...tokens, model }); throw new UnprocessableEntityException('The AI declined this request. Try rephrasing your notes.'); }
        try { raw = normalise(i.task, parseJson(res.text), sources); } catch (e: any) { lastError = e.message; }
      }
      if (fallback) raw = offlineDraft(ctx);
      else if (raw === undefined) {
        await record({ status: 'INVALID', error: lastError, ...tokens, model });
        throw new UnprocessableEntityException(`The AI answer could not be used (${lastError}). Please try again.`);
      }
    }
    const live = provider.live && !fallback;
    const { output, warnings } = live ? raw : normalise(i.task, raw, sources);
    if (ocrNote) warnings.unshift(ocrNote);
    if (fallback) warnings.unshift(`The AI service could not be used (${fallback}) — this is an offline draft from the lesson data. Ask your admin to check the AI settings.`);
    else if (!provider.live) warnings.unshift('Offline draft: no AI model is configured, so this was assembled from the lesson data only.');
    const id = await record({ status: 'OK', output, ...tokens, model: fallback ? 'offline-drafter' : model, ...(fallback ? { error: fallback } : {}) });
    return {
      id, task: i.task, provider: provider.name, model: fallback ? 'offline-drafter' : model, live, grounded: sources.length > 0, output, warnings,
      sources: sources.map((s) => ({ n: s.n, page: s.page, component: s.component, componentId: s.componentId, lesson: s.lesson, snippet: s.text.slice(0, 220) })),
      usage: { ...tokens, usedThisMonth: used + 1, monthlyLimit: limit },
    };
  }

  async history() {
    return this.q.select({ id: aiGenerations.id, task: aiGenerations.task, status: aiGenerations.status, grounded: aiGenerations.grounded, usedAs: aiGenerations.usedAs,
      createdAt: aiGenerations.createdAt, provider: aiGenerations.provider, model: aiGenerations.model,
      title: sql<string | null>`${aiGenerations.output}->>'title'`,
      lesson: sql<string | null>`(SELECT 'Lesson ' || l.number || ': ' || l.title FROM book_lessons l WHERE l.id = ${aiGenerations.lessonId})` })
      .from(aiGenerations).where(and(eq(aiGenerations.userId, this.ctx.userId), sql`${aiGenerations.task} <> 'CHAT'`)).orderBy(desc(aiGenerations.createdAt)).limit(50);
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
