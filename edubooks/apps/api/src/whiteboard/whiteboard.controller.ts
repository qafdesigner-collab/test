import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Min, ValidateNested } from 'class-validator';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { Roles } from '../common/decorators';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';

const Id = () => new ParseUUIDPipe();
const arr = (ids: string[]) => `{${ids.join(',')}}`;
const KINDS = ['pts', 'undo', 'clear', 'bg', 'text', 'shape'] as const;
type Kind = (typeof KINDS)[number];

class CreateBoardDto {
  @IsUUID() classId!: string;
  @IsString() @Length(1, 120) title!: string;
  @IsOptional() @IsUUID() editionId?: string;
  @IsOptional() @IsUUID() componentId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}
class OpDto { @IsIn(KINDS as unknown as string[]) kind!: Kind; @IsObject() data!: Record<string, any>; }
class OpsDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => OpDto) ops!: OpDto[]; }
class OpsQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(0) after?: number; }
class ListQuery { @IsOptional() @IsIn(['1', 'true']) live?: string; }

const n01 = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= -0.05 && v <= 1.05;
const color = (v: any) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#1f2937');
const sid = (v: any) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null);

/** Cleans one drawing operation so only small, well-formed data is stored and replayed to pupils. */
function clean(kind: Kind, d: Record<string, any>): Record<string, any> {
  switch (kind) {
    case 'pts': {
      const id = sid(d.id); if (!id) throw new BadRequestException('Stroke id missing');
      if (!Array.isArray(d.p) || !d.p.length || d.p.length > 600) throw new BadRequestException('A stroke chunk needs 1–600 points');
      const p = d.p.map((q: any) => { if (!Array.isArray(q) || !n01(q[0]) || !n01(q[1])) throw new BadRequestException('Bad point'); return [Math.round(q[0] * 1e4) / 1e4, Math.round(q[1] * 1e4) / 1e4]; });
      const w = Math.min(80, Math.max(1, Number(d.w) || 3));
      return { id, p, w, c: color(d.c), t: ['pen', 'hl', 'er'].includes(d.t) ? d.t : 'pen' };
    }
    case 'text': {
      const id = sid(d.id); if (!id || !n01(d.x) || !n01(d.y)) throw new BadRequestException('Text needs an id and a position');
      const s = String(d.s ?? '').slice(0, 300); if (!s.trim()) throw new BadRequestException('Empty text');
      return { id, x: d.x, y: d.y, s, c: color(d.c), w: Math.min(120, Math.max(8, Number(d.w) || 28)) };
    }
    case 'shape': {
      const id = sid(d.id); if (!id) throw new BadRequestException('Shape id missing');
      if (!['line', 'arrow', 'rect', 'ellipse'].includes(d.s)) throw new BadRequestException('Unknown shape');
      const pt = (q: any) => { if (!Array.isArray(q) || !n01(q[0]) || !n01(q[1])) throw new BadRequestException('Bad point'); return [Math.round(q[0] * 1e4) / 1e4, Math.round(q[1] * 1e4) / 1e4]; };
      return { id, s: d.s, a: pt(d.a), b: pt(d.b), c: color(d.c), w: Math.min(40, Math.max(1, Number(d.w) || 3)), f: d.f === true };
    }
    case 'undo': { const id = sid(d.id); if (!id) throw new BadRequestException('Nothing to undo'); return { id }; }
    case 'clear': return {};
    case 'bg': return { componentId: typeof d.componentId === 'string' && /^[0-9a-f-]{36}$/.test(d.componentId) ? d.componentId : null, page: Number.isInteger(d.page) && d.page > 0 && d.page < 100000 ? d.page : null,
      ...(['plain', 'dots', 'grid', 'lines', 'kg'].includes(d.paper) ? { paper: d.paper } : {}) };
  }
}

@Injectable()
export class WhiteboardService {
  constructor(private readonly db: DbService, private readonly access: AccessService) {}
  private get ctx() { return this.db.ctx; }
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }

  private async board(id: string) {
    const [b] = await this.rows(sql`SELECT w.*, c.name AS class_name, c.section, u.display_name AS teacher_name, bc.title AS part_title, p.title AS book_title
      FROM whiteboards w JOIN classes c ON c.id = w.class_id LEFT JOIN users u ON u.id = w.teacher_id
      LEFT JOIN book_components bc ON bc.id = w.component_id LEFT JOIN book_editions e ON e.id = w.edition_id LEFT JOIN book_packages p ON p.id = e.package_id
      WHERE w.id = ${id}`);
    if (!b) throw new NotFoundException('Whiteboard not found');
    return b;
  }
  /** Teachers of the class (and the school admin) write; pupils of the class watch. */
  private async canSee(b: any) {
    if (this.access.is('SCHOOL_ADMIN')) return;
    if (this.access.is('TEACHER') && (b.teacher_id === this.ctx.userId || (await this.access.teacherClassIds()).includes(b.class_id))) return;
    if (this.access.is('STUDENT') && (await this.access.studentClassIds()).includes(b.class_id)) return;
    throw new ForbiddenException('This whiteboard is for another class');
  }
  private async canWrite(b: any) {
    if (this.access.is('SCHOOL_ADMIN')) return;
    if (this.access.is('TEACHER') && (b.teacher_id === this.ctx.userId || (await this.access.teacherClassIds()).includes(b.class_id))) return;
    throw new ForbiddenException('Only the class teacher can write on this whiteboard');
  }
  private view(b: any) {
    return { id: b.id, title: b.title, live: b.live, classId: b.class_id, className: `${b.class_name}${b.section ? ` ${b.section}` : ''}`, teacher: b.teacher_name,
      mine: b.teacher_id === this.ctx.userId, editionId: b.edition_id, componentId: b.component_id, page: b.page, bookTitle: b.book_title, partTitle: b.part_title,
      seq: Number(b.seq), createdAt: b.created_at, updatedAt: b.updated_at, endedAt: b.ended_at };
  }

  async list(liveOnly: boolean) {
    let where = sql`true`;
    if (!this.access.is('SCHOOL_ADMIN')) {
      const ids = this.access.is('TEACHER') ? await this.access.teacherClassIds() : await this.access.studentClassIds();
      const mine = this.access.is('TEACHER') ? sql` OR w.teacher_id = ${this.ctx.userId}` : sql``;
      where = ids.length ? sql`(w.class_id = ANY(${arr(ids)}::uuid[])${mine})` : this.access.is('TEACHER') ? sql`w.teacher_id = ${this.ctx.userId}` : sql`false`;
    }
    // Pupils only see boards that are live now (and were used in the last 3 hours).
    const pupil = this.access.is('STUDENT') && !this.access.is('TEACHER');
    const live = liveOnly || pupil ? sql` AND w.live AND w.updated_at > now() - interval '3 hours'` : sql``;
    const rows = await this.rows(sql`SELECT w.*, c.name AS class_name, c.section, u.display_name AS teacher_name, bc.title AS part_title, p.title AS book_title
      FROM whiteboards w JOIN classes c ON c.id = w.class_id LEFT JOIN users u ON u.id = w.teacher_id
      LEFT JOIN book_components bc ON bc.id = w.component_id LEFT JOIN book_editions e ON e.id = w.edition_id LEFT JOIN book_packages p ON p.id = e.package_id
      WHERE ${where}${live} ORDER BY w.live DESC, w.updated_at DESC LIMIT 60`);
    return rows.map((b) => this.view(b));
  }

  async create(d: CreateBoardDto) {
    await this.access.assertTeaches(d.classId);
    let editionId = d.editionId ?? null;
    if (d.componentId) {
      const [c] = await this.rows(sql`SELECT edition_id FROM book_components WHERE id = ${d.componentId}`);
      if (!c) throw new BadRequestException('Book part not found');
      editionId = c.edition_id;
    }
    if (editionId) await this.access.assertEdition(editionId);
    const [b] = await this.rows(sql`INSERT INTO whiteboards (publisher_id, school_id, class_id, teacher_id, title, edition_id, component_id, page)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${d.classId}, ${this.ctx.userId}, ${d.title.trim()}, ${editionId}, ${d.componentId ?? null}, ${d.componentId ? d.page ?? 1 : null}) RETURNING id`);
    return this.get(b.id);
  }

  async get(id: string) { const b = await this.board(id); await this.canSee(b); return this.view(b); }

  async ops(id: string, after = 0) {
    const b = await this.board(id); await this.canSee(b);
    // Students following a live board count as "watching" (refreshed at most every few seconds).
    if (b.live && this.access.is('STUDENT') && !this.access.is('TEACHER')) {
      await this.db.q.execute(sql`INSERT INTO whiteboard_viewers (board_id, user_id, publisher_id, school_id) VALUES (${id}, ${this.ctx.userId}, ${b.publisher_id}, ${b.school_id})
        ON CONFLICT (board_id, user_id) DO UPDATE SET last_seen = now() WHERE whiteboard_viewers.last_seen < now() - interval '5 seconds'`);
    }
    const ops = await this.rows(sql`SELECT seq::int AS seq, kind, data FROM whiteboard_ops WHERE board_id = ${id} AND seq > ${after} ORDER BY seq LIMIT 3000`);
    return { live: b.live, seq: Number(b.seq), componentId: b.component_id, page: b.page, ops };
  }

  async write(id: string, d: OpsDto) {
    const b = await this.board(id); await this.canWrite(b);
    if (!b.live) throw new BadRequestException('This whiteboard has ended. Start it again to write.');
    const ops = d.ops.map((o) => ({ kind: o.kind, data: clean(o.kind, o.data ?? {}) }));
    if (JSON.stringify(ops).length > 400_000) throw new BadRequestException('Too much at once');
    const bg = [...ops].reverse().find((o) => o.kind === 'bg');
    // Reserve sequence numbers on the board row (serialises concurrent writers).
    const [r] = await this.rows(sql`UPDATE whiteboards SET seq = seq + ${ops.length}, updated_at = now()
      ${bg?.data.componentId ? sql`, component_id = ${bg.data.componentId}, page = ${bg.data.page}` : sql``} WHERE id = ${id} RETURNING seq::int AS seq`);
    const first = r.seq - ops.length + 1;
    for (const [i, o] of ops.entries()) {
      await this.db.q.execute(sql`INSERT INTO whiteboard_ops (board_id, seq, publisher_id, school_id, kind, data)
        VALUES (${id}, ${first + i}, ${b.publisher_id}, ${b.school_id}, ${o.kind}, ${JSON.stringify(o.data)}::jsonb)`);
    }
    return { seq: r.seq };
  }

  /** Students who looked at the live board in the last 20 seconds. */
  async watchers(id: string) {
    const b = await this.board(id); await this.canWrite(b);
    const rows = await this.rows(sql`SELECT u.display_name AS name FROM whiteboard_viewers v JOIN users u ON u.id = v.user_id
      WHERE v.board_id = ${id} AND v.last_seen > now() - interval '20 seconds' ORDER BY u.display_name`);
    const [{ n }] = await this.rows(sql`SELECT count(*)::int AS n FROM enrolments WHERE class_id = ${b.class_id}`);
    return { watching: rows.length, classSize: n, names: rows.map((r) => r.name) };
  }

  async setLive(id: string, live: boolean) {
    const b = await this.board(id); await this.canWrite(b);
    await this.db.q.execute(sql`UPDATE whiteboards SET live = ${live}, updated_at = now(), ended_at = ${live ? null : sql`now()`} WHERE id = ${id}`);
    return this.get(id);
  }

  async remove(id: string) {
    const b = await this.board(id); await this.canWrite(b);
    await this.db.q.execute(sql`DELETE FROM whiteboards WHERE id = ${id}`);
    return { ok: true };
  }
}

@ApiTags('whiteboard')
@Controller('whiteboards')
export class WhiteboardController {
  constructor(private readonly svc: WhiteboardService) {}
  @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT') @Get() list(@Query() q: ListQuery) { return this.svc.list(!!q.live); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Post() create(@Body() d: CreateBoardDto) { return this.svc.create(d); }
  @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT') @Get(':id') get(@Param('id', Id()) id: string) { return this.svc.get(id); }
  /** Polled about once a second by every watching student, so it is not rate limited like other calls. */
  @SkipThrottle() @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT') @Get(':id/ops') ops(@Param('id', Id()) id: string, @Query() q: OpsQuery) { return this.svc.ops(id, q.after ?? 0); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Post(':id/ops') @HttpCode(200) write(@Param('id', Id()) id: string, @Body() d: OpsDto) { return this.svc.write(id, d); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Get(':id/watchers') watchers(@Param('id', Id()) id: string) { return this.svc.watchers(id); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Post(':id/end') @HttpCode(200) end(@Param('id', Id()) id: string) { return this.svc.setLive(id, false); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Post(':id/resume') @HttpCode(200) resume(@Param('id', Id()) id: string) { return this.svc.setLive(id, true); }
  @Roles('SCHOOL_ADMIN', 'TEACHER') @Delete(':id') remove(@Param('id', Id()) id: string) { return this.svc.remove(id); }
}

@Module({ imports: [LmsModule], controllers: [WhiteboardController], providers: [WhiteboardService] })
export class WhiteboardModule {}
