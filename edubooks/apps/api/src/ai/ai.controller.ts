import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { visibleFor } from '../common/visibility';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ValidateNested, ArrayMaxSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { AccessService } from '../lms/access.service';
import { makePageQuestions, QType } from './page-questions';
import { Roles } from '../common/decorators';
import { AiService } from './ai.service';
import { IndexerService } from './indexer.service';
import { ContentsService } from './contents.service';
import { TASKS } from './tasks';

class ChatTurn { @IsIn(['user', 'assistant']) role!: 'user' | 'assistant'; @IsString() @MaxLength(6000) text!: string; }
class ChatDto {
  @IsString() @MaxLength(4000) message!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ChatTurn) history?: ChatTurn[];
  @IsOptional() @IsUUID() editionId?: string;
}
class GenerateDto {
  @IsIn(Object.keys(TASKS)) task: keyof typeof TASKS;
  @IsUUID() editionId: string;
  @IsOptional() @IsUUID() lessonId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  /** Instead of a lesson: a book part and its pages, e.g. "1-5, 10-15". */
  @IsOptional() @IsUUID() componentId?: string;
  @IsOptional() @IsString() @MaxLength(100) pages?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(180) durationMin?: number;
  @IsOptional() @IsIn(['EASY', 'MEDIUM', 'HARD']) difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) count?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
class UseDto {
  @IsIn(['LESSON_PLAN', 'ASSESSMENT', 'QUESTION_BANK']) as: 'LESSON_PLAN' | 'ASSESSMENT' | 'QUESTION_BANK';
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  /** The teacher's edited version of the draft. */
  @IsOptional() @IsObject() output?: Record<string, unknown>;
}
const Id = () => new ParseUUIDPipe();
class PageQuestionsDto {
  @IsUUID() editionId!: string;
  @IsUUID() componentId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5000) page!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5000) pageTo?: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(30) count!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsIn(['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT'], { each: true }) types?: QType[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) seed?: number;
}

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService, private readonly indexer: IndexerService, private readonly db: DbService, private readonly access: AccessService, private readonly contents: ContentsService) {}

  /** Questions from a book page, made by the built-in question maker: free, unlimited, no outside AI service. */
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Post('page-questions')
  async pageQuestions(@Body() d: PageQuestionsDto) {
    await this.access.assertEdition(d.editionId);
    const to = Math.min(Math.max(d.pageTo ?? d.page, d.page), d.page + 9);
    // automatic OCR of these pages when they have no text yet
    await this.indexer.ensurePageText(d.componentId, Array.from({ length: to - d.page + 1 }, (_, k) => d.page + k)).catch(() => undefined);
    const rows = (await this.db.q.execute(sql`SELECT p.page_number AS page, p.text_content AS text FROM book_pages p JOIN book_components c ON c.id = p.component_id
      WHERE p.component_id = ${d.componentId} AND c.edition_id = ${d.editionId} AND c.visible_to::text IN ${visibleFor(this.db.ctx) ?? ['ALL', 'TEACHER', 'STUDENT']} AND p.page_number BETWEEN ${d.page} AND ${to} ORDER BY p.page_number`)).rows as { page: number; text: string }[];
    const withText = rows.filter((x) => x.text.replace(/\s+/g, ' ').trim().split(' ').length >= 3);
    const items = makePageQuestions(withText, { count: d.count, types: d.types ?? [], seed: d.seed ?? 0 });
    const warnings: string[] = [];
    if (!rows.length) warnings.push('The text of this part has not been read yet. Ask the publisher to press “Re-index” for this part, then try again.');
    else if (!withText.length) warnings.push(`Page ${d.page}${to > d.page ? `–${to}` : ''} has no readable text (it is a picture page). Look at the preview and write the questions yourself, or choose a page with words.`);
    else if (items.length < d.count) warnings.push(`This page has only enough text for ${items.length} question(s).`);
    return { items, pages: rows.map((x) => ({ page: x.page, hasText: withText.some((w) => w.page === x.page) })), source: 'built-in', warnings };
  }
  @Roles('TEACHER', 'SCHOOL_ADMIN', 'PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Get('status') status() { return this.ai.status(); }
  /** Teachers' open assistant (research, question papers, anything for teaching). Students have Ask Owl only. */
  @Roles('TEACHER', 'SCHOOL_ADMIN') @Throttle({ default: { limit: 20, ttl: 60_000 } }) @Post('chat') chat(@Body() d: ChatDto) { return this.ai.chat(d); }
  @Roles('TEACHER') @Throttle({ default: { limit: Number(process.env.AI_RATE_LIMIT_PER_MIN || 10), ttl: 60_000 } })
  @Post('generate') generate(@Body() d: GenerateDto) { return this.ai.generate(d); }
  @Roles('TEACHER') @Get('generations') history() { return this.ai.history(); }
  @Roles('TEACHER') @Get('generations/:id') get(@Param('id', Id()) id: string) { return this.ai.get(id); }
  @Roles('TEACHER') @Post('generations/:id/use') use(@Param('id', Id()) id: string, @Body() d: UseDto) { return this.ai.use(id, d); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN') @Get('usage') usage() { return this.ai.usage(); }

  // Publisher: the text index the assistant is grounded in.
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Get('index/editions/:id') indexStatus(@Param('id', Id()) id: string) { return this.indexer.status(id); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Post('index/components/:id') index(@Param('id', Id()) id: string) { return this.indexer.start(id); }

  // Publisher: contents (units, lessons and their first pages) found from the part's pages
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Post('contents/components/:id/find')
  async findContents(@Param('id', Id()) id: string) {
    const ctx = { ...this.db.ctx };
    await this.contents.save(id, { source: 'HEADINGS', units: [], foundAt: new Date().toISOString(), running: true });
    // in the background: the AI can take a minute, longer than a hosting allows for one request
    setImmediate(() => { this.db.detached(ctx, async () => {
      try { await this.contents.save(id, await this.contents.detect(id)); }
      catch (e: any) { await this.contents.save(id, { source: 'HEADINGS', units: [], foundAt: new Date().toISOString(), error: String(e.message).slice(0, 300) }); }
    }).catch(() => undefined); });
    return { started: true };
  }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Post('contents/components/:id/apply') applyContents(@Param('id', Id()) id: string) { return this.contents.apply(id); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Delete('contents/components/:id') dismissContents(@Param('id', Id()) id: string) { return this.contents.dismiss(id); }
}
