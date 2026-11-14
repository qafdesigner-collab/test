import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpException, HttpStatus, Injectable, Put, Post, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { Roles } from '../common/decorators';
import { config } from '../config';
import { AccessService } from '../lms/access.service';
import { AiProviderService } from './provider.service';
import { RetrievalService } from './retrieval.service';
import { parseJson } from './tasks';

class AskDto {
  @IsUUID() editionId!: string; @IsUUID() componentId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5000) page!: number;
  @IsIn(['EXPLAIN', 'ASK', 'QUIZ']) mode!: 'EXPLAIN' | 'ASK' | 'QUIZ';
  @IsOptional() @IsString() @MaxLength(300) question?: string;
}
class SettingsDto { @IsBoolean() enabled!: boolean; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) dailyLimit?: number; }

/** Topics a children's book helper never discusses: the pupil is kindly sent to a trusted adult and the teacher can see it. */
const UNSAFE = /\b(kill (myself|me|you|him|her)|suicide|self[- ]?harm|cut myself|want to die|gun|bomb|weapon|drugs?|alcohol|beer|cigarettes?|vape|sex|sexy|naked|porn|kiss me|abuse|abused|hits? me|hurts? me|touch(es|ed)? me)\b/i;
const PERSONAL = /([\w.+-]+@[\w-]+\.[\w.]+)|(\+?\d[\d\s-]{7,}\d)|\b(my address|i live (at|in)|my phone|my password)\b/i;
const SAFE_REPLY = "That sounds like something to talk about with a grown-up you trust, like your teacher or your family. 💛 Shall we get back to your book? 📚";
const PRIVATE_REPLY = "Please don't share your phone number, address, email or passwords here. Keep them safe! 🔒 What would you like to know about your book?";

const OUT_BLOCK = /(https?:\/\/|www\.)/i;
const tidy = (s: string) => s.replace(/https?:\/\/\S+/g, '').replace(/\s+\n/g, '\n').trim().slice(0, 900);

@Injectable()
export class TutorService {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly providers: AiProviderService, private readonly retrieval: RetrievalService) {}
  private get ctx() { return this.db.ctx; }
  private async rows(s: ReturnType<typeof sql>) { return (await this.db.q.execute(s)).rows as any[]; }
  private async one(s: ReturnType<typeof sql>) { return (await this.rows(s))[0]; }
  private globalOff() { return (process.env.AI_TUTOR ?? '').toLowerCase() === 'off'; }

  async settings() {
    const s = await this.one(sql`SELECT enabled, daily_limit AS "dailyLimit" FROM tutor_settings WHERE school_id = ${this.ctx.schoolId}`);
    return { enabled: !this.globalOff() && !!s?.enabled, dailyLimit: s?.dailyLimit ?? 20, available: !this.globalOff(), live: this.providers.provider.live };
  }

  async saveSettings(d: SettingsDto) {
    await this.db.q.execute(sql`INSERT INTO tutor_settings (school_id, publisher_id, enabled, daily_limit, updated_by) VALUES (${this.ctx.schoolId}, ${this.ctx.publisherId}, ${d.enabled}, ${d.dailyLimit ?? 20}, ${this.ctx.userId})
      ON CONFLICT (school_id) DO UPDATE SET enabled = excluded.enabled, daily_limit = excluded.daily_limit, updated_by = excluded.updated_by, updated_at = now()`);
    return this.settings();
  }

  private async usedToday() {
    return (await this.one(sql`SELECT count(*)::int AS n FROM tutor_messages WHERE student_id = ${this.ctx.userId} AND created_at >= date_trunc('day', now())`)).n as number;
  }

  async status() {
    const s = await this.settings();
    return { enabled: s.enabled, remaining: s.enabled ? Math.max(0, s.dailyLimit - (await this.usedToday())) : 0 };
  }

  /** Text of the page the pupil is looking at, plus the page either side. */
  private async pageText(componentId: string, page: number) {
    return this.rows(sql`SELECT page_number AS page, text_content AS text FROM book_pages WHERE component_id = ${componentId} AND page_number BETWEEN ${page - 1} AND ${page + 1} AND length(text_content) > 10 ORDER BY page_number`);
  }

  async ask(d: AskDto) {
    const s = await this.settings();
    if (!s.enabled) throw new ForbiddenException('Ask Owl is not switched on for your school yet');
    await this.access.assertEdition(d.editionId);
    const comp = await this.one(sql`SELECT c.id, c.title, b.title AS book, g.name AS grade FROM book_components c JOIN book_editions e ON e.id = c.edition_id JOIN book_packages b ON b.id = e.package_id
      LEFT JOIN grades g ON g.id = b.grade_id WHERE c.id = ${d.componentId} AND c.edition_id = ${d.editionId}`);
    if (!comp) throw new BadRequestException('That page is not in this book');
    const used = await this.usedToday();
    if (used >= s.dailyLimit) throw new HttpException("You've asked lots of great questions today! Owl is resting now — try again tomorrow. 🦉", HttpStatus.TOO_MANY_REQUESTS);
    const question = (d.question ?? '').trim();
    if (d.mode === 'ASK' && question.length < 2) throw new BadRequestException('Type your question');

    const save = async (v: { answer: string; sources?: any[]; flagged?: boolean; live?: boolean; inTok?: number; outTok?: number; quiz?: any[] }) => {
      await this.db.q.execute(sql`INSERT INTO tutor_messages (publisher_id, school_id, student_id, edition_id, component_id, page, mode, question, answer, sources, flagged, live, input_tokens, output_tokens)
        VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${this.ctx.userId}, ${d.editionId}, ${d.componentId}, ${d.page}, ${d.mode}, ${question.slice(0, 300)}, ${v.answer},
          ${JSON.stringify(v.sources ?? [])}::jsonb, ${!!v.flagged}, ${!!v.live}, ${v.inTok ?? 0}, ${v.outTok ?? 0})`);
      return { answer: v.answer, quiz: v.quiz ?? null, sources: v.sources ?? [], flagged: !!v.flagged, remaining: Math.max(0, s.dailyLimit - used - 1) };
    };
    if (question && UNSAFE.test(question)) return save({ answer: SAFE_REPLY, flagged: true });
    if (question && PERSONAL.test(question)) return save({ answer: PRIVATE_REPLY, flagged: true });

    const near = await this.pageText(d.componentId, d.page);
    const extra = d.mode === 'ASK' ? await this.retrieval.sources({ editionId: d.editionId, query: question }) : [];
    const sources = [...near.map((p) => ({ page: p.page, text: String(p.text).slice(0, 2500) })),
      ...extra.filter((x) => !(x.componentId === d.componentId && near.some((p) => p.page === x.page))).slice(0, 3).map((x) => ({ page: x.page, text: x.text.slice(0, 1500), part: x.component }))];
    if (!sources.length) return save({ answer: "I can't read the words on this page yet, so I can't help with it. Please ask your teacher! 🦉" });

    const provider = this.providers.provider;
    const monthly = await this.one(sql`SELECT (SELECT count(*) FROM ai_generations WHERE school_id = ${this.ctx.schoolId} AND created_at >= date_trunc('month', now()))
      + (SELECT count(*) FROM tutor_messages WHERE school_id = ${this.ctx.schoolId} AND live AND created_at >= date_trunc('month', now())) AS n`);
    if (!provider.live || Number(monthly.n) >= config.ai.monthlyRequestsPerSchool) return save(this.offline(d.mode, question, sources, d.page));

    const system = [
      `You are Owl, a kind, patient reading helper for a young child (${comp.grade ?? 'primary school'}). You help ONLY with the book "${comp.book}".`,
      'Use ONLY the BOOK PAGES given. If the answer is not in them, say kindly that the book does not say, and suggest asking the teacher.',
      'Use very simple words and short sentences (at most 5 sentences). Be warm and encouraging. You may use one or two emojis.',
      'Never ask for or mention personal information. Never give links. Never talk about violence, adult topics or anything unsafe; instead suggest talking to a trusted grown-up.',
      'Do not do homework for the child: give hints and explain ideas, but do not just give answers to worksheet questions.',
      'Reply with JSON only.',
    ].join('\n');
    const shape = d.mode === 'QUIZ'
      ? '{"answer": "one short encouraging sentence", "quiz": [{"q": string, "options": [3 short strings], "answer": index of the right option}] (exactly 3 questions about these pages), "pages": [page numbers used]}'
      : '{"answer": string, "pages": [page numbers used]}';
    const task = d.mode === 'EXPLAIN' ? `Explain page ${d.page} simply, as if to a young child.` : d.mode === 'QUIZ' ? `Make a tiny quiz about page ${d.page}.` : `The child asks: "${question.replace(/"/g, "'")}"`;
    const user = `BOOK PAGES:\n${sources.map((x: any) => `[page ${x.page}${x.part ? `, ${x.part}` : ''}]\n${x.text}`).join('\n\n')}\n\nTASK: ${task}\n\nReply as JSON: ${shape}`;
    try {
      const res = await provider.generate({ system, user, maxTokens: 700, json: true });
      if (res.refused) return save({ answer: SAFE_REPLY, flagged: true, live: true, inTok: res.inputTokens, outTok: res.outputTokens });
      const j = parseJson(res.text) as any;
      let answer = tidy(String(j.answer ?? ''));
      if (!answer || OUT_BLOCK.test(answer) || UNSAFE.test(answer)) answer = "Hmm, I'm not sure. Let's ask your teacher! 🦉";
      const quiz = d.mode === 'QUIZ' && Array.isArray(j.quiz) ? j.quiz.slice(0, 3).map((x: any) => ({ q: tidy(String(x.q ?? '')).slice(0, 200), options: (Array.isArray(x.options) ? x.options : []).slice(0, 4).map((o: any) => tidy(String(o)).slice(0, 80)), answer: Number(x.answer) }))
        .filter((x: any) => x.q && x.options.length >= 2 && x.answer >= 0 && x.answer < x.options.length) : undefined;
      const pages = (Array.isArray(j.pages) ? j.pages : []).map(Number).filter((p: number) => sources.some((x: any) => x.page === p));
      return save({ answer, quiz, sources: pages.map((page: number) => ({ page })), live: true, inTok: res.inputTokens, outTok: res.outputTokens });
    } catch {
      return save(this.offline(d.mode, question, sources, d.page));
    }
  }

  /** Without an AI model: show the book's own words that match best. */
  private offline(mode: string, question: string, sources: { page: number; text: string }[], page: number) {
    const here = sources.find((x) => x.page === page) ?? sources[0];
    const sentences = (t: string) => t.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 8);
    if (mode === 'ASK') {
      const words = question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
      const scored = sources.flatMap((x) => sentences(x.text).map((s) => ({ s, page: x.page, n: words.filter((w) => s.toLowerCase().includes(w)).length }))).sort((a, b) => b.n - a.n);
      if (!scored.length || !scored[0].n) return { answer: "I couldn't find that in your book. Try asking your teacher! 🦉", sources: [] };
      const best = scored.slice(0, 2);
      return { answer: `Here is what your book says: “${best.map((b) => b.s).join(' ')}”`, sources: [...new Set(best.map((b) => b.page))].map((p) => ({ page: p })) };
    }
    const first = sentences(here.text).slice(0, 3).join(' ');
    if (mode === 'QUIZ') return { answer: 'Read the page again, then tell a grown-up three things you learned! ⭐', sources: [{ page: here.page }] };
    return { answer: first ? `This page says: “${first}”` : 'Look at the pictures on this page and tell a grown-up what you see! 👀', sources: [{ page: here.page }] };
  }

  /** What pupils asked Owl: teachers see their classes, school admins the whole school. */
  async log(classId?: string, flaggedOnly = false) {
    const cls = this.access.is('SCHOOL_ADMIN') ? null : await this.access.teacherClassIds();
    if (classId) await this.access.assertTeaches(classId);
    const scope = classId ? sql`t.student_id IN (SELECT student_id FROM enrolments WHERE class_id = ${classId})`
      : cls ? sql`t.student_id IN (SELECT student_id FROM enrolments WHERE class_id = ANY(${`{${(cls.length ? cls : ['00000000-0000-0000-0000-000000000000']).join(',')}}`}::uuid[]))` : sql`true`;
    return this.rows(sql`SELECT t.id, t.mode, t.question, t.answer, t.page, t.flagged, t.created_at AS "createdAt", u.display_name AS student, b.title AS book
      FROM tutor_messages t JOIN users u ON u.id = t.student_id LEFT JOIN book_editions e ON e.id = t.edition_id LEFT JOIN book_packages b ON b.id = e.package_id
      WHERE ${scope} AND ${flaggedOnly ? sql`t.flagged` : sql`true`} ORDER BY t.created_at DESC LIMIT 200`);
  }
}

@ApiTags('tutor')
@Controller('tutor')
export class TutorController {
  constructor(private readonly svc: TutorService) {}
  @Roles('STUDENT') @Get('status') status() { return this.svc.status(); }
  @Roles('STUDENT') @Post('ask') ask(@Body() d: AskDto) { return this.svc.ask(d); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Get('settings') settings() { return this.svc.settings(); }
  @Roles('SCHOOL_ADMIN') @Put('settings') save(@Body() d: SettingsDto) { return this.svc.saveSettings(d); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Get('log') log(@Query('classId', new ParseUUIDPipe({ optional: true })) classId?: string, @Query('flagged') flagged?: string) { return this.svc.log(classId, flagged === '1'); }
}
