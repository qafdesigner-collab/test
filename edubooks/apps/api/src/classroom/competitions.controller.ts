import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { sql } from 'drizzle-orm';
import { Roles } from '../common/decorators';
import { appTmp } from '../common/tmp';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { AccessService } from '../lms/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { pictureUrl } from '../people/avatars';

export const CATEGORIES = ['SINGING', 'ART', 'DRAWING', 'POETRY', 'QURAN', 'SPELLING', 'STORY', 'SCIENCE', 'SPORTS', 'OTHER'] as const;
const IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

class CompetitionDto {
  @IsString() @Length(2, 160) title!: string;
  @IsIn(CATEGORIES) category!: string;
  @IsOptional() @IsString() @MaxLength(16) emoji?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsIn(['PHOTO', 'AUDIO', 'TEXT', 'ANY']) entryKind!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) classIds?: string[];
  @IsOptional() @IsDateString() entriesUntil?: string | null;
  @IsOptional() @IsDateString() votingUntil?: string | null;
  @IsOptional() @IsBoolean() studentVotes?: boolean;
  @IsOptional() @IsBoolean() teacherVotes?: boolean;
}
class StatusDto { @IsIn(['OPEN', 'VOTING']) status!: 'OPEN' | 'VOTING'; }
class EntryDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Matches(/^[\w./-]{10,300}$/) imageKey?: string | null;
  @IsOptional() @IsUUID() audioId?: string | null;
}
class UploadDto { @IsString() @MaxLength(1_400_000) image!: string; }
class VoteDto { @IsUUID() entryId!: string; }
class PlaceDto { @IsUUID() entryId!: string; @Type(() => Number) @IsInt() @Min(1) @Max(3) place!: number; }
class ResultsDto {
  @IsArray() @ArrayMaxSize(9) @ValidateNested({ each: true }) @Type(() => PlaceDto) places!: PlaceDto[];
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsBoolean() toTimeline?: boolean;
  @IsOptional() @IsBoolean() toFame?: boolean;
}

/** School competitions: the school admin runs them, students enter, students and teachers vote, results are announced. */
@Injectable()
export class CompetitionsService {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly assets: AssetsService,
    private readonly notifications: NotificationsService, private readonly audit: AuditService) {}
  private get ctx() { return this.db.ctx; }
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }
  private is(r: string) { return (this.ctx.roles ?? []).includes(r); }
  private get staff() { return this.is('SCHOOL_ADMIN') || this.is('TEACHER'); }

  /** The classes that count for me: a student's own, a parent's children's; staff see every competition. */
  private async myClasses(): Promise<string[] | null> {
    if (this.staff) return null;
    if (this.is('STUDENT')) return this.access.studentClassIds();
    return (await this.rows(sql`SELECT DISTINCT e.class_id FROM parent_students ps JOIN enrolments e ON e.student_id = ps.student_id WHERE ps.parent_id = ${this.ctx.userId}`)).map((r) => r.class_id);
  }
  private seen(classes: string[] | null) {
    return classes === null ? sql`TRUE` : classes.length ? sql`(cardinality(c.class_ids) = 0 OR c.class_ids && ${`{${classes.join(',')}}`}::uuid[])` : sql`cardinality(c.class_ids) = 0`;
  }
  private async one(id: string) {
    const [c] = await this.rows(sql`SELECT c.* FROM competitions c WHERE c.id = ${id} AND ${this.seen(await this.myClasses())}`);
    if (!c) throw new NotFoundException('Competition not found');
    return c;
  }
  private canVote(c: any) { return c.status === 'VOTING' && ((this.is('STUDENT') && c.student_votes) || ((this.is('TEACHER') || this.is('SCHOOL_ADMIN')) && c.teacher_votes)); }

  async list() {
    const classes = await this.myClasses();
    const list = await this.rows(sql`SELECT c.id, c.title, c.category, c.emoji, c.description, c.entry_kind AS "entryKind", c.status, c.entries_until AS "entriesUntil", c.voting_until AS "votingUntil",
        c.results_at AS "resultsAt", c.created_at AS "createdAt", c.class_ids AS "classIds",
        (SELECT count(*)::int FROM competition_entries e WHERE e.competition_id = c.id) AS entries,
        (SELECT count(*)::int FROM competition_votes v WHERE v.competition_id = c.id) AS votes,
        EXISTS (SELECT 1 FROM competition_entries e WHERE e.competition_id = c.id AND e.student_id = ${this.ctx.userId}) AS "entered",
        EXISTS (SELECT 1 FROM competition_votes v WHERE v.competition_id = c.id AND v.voter_id = ${this.ctx.userId}) AS "voted",
        (SELECT json_agg(json_build_object('place', e.place, 'name', u.display_name) ORDER BY e.place) FROM competition_entries e JOIN users u ON u.id = e.student_id WHERE e.competition_id = c.id AND e.place IS NOT NULL) AS winners
      FROM competitions c WHERE ${this.seen(classes)} ORDER BY (c.status = 'RESULTS'), c.created_at DESC LIMIT 100`);
    return list;
  }

  async detail(id: string) {
    const c = await this.one(id);
    const admin = this.is('SCHOOL_ADMIN'); const showVotes = this.staff || c.status === 'RESULTS';
    // a parent sees only their own children's entries until the results are out
    const kids = this.is('PARENT') ? (await this.rows(sql`SELECT student_id FROM parent_students WHERE parent_id = ${this.ctx.userId}`)).map((r) => r.student_id) : null;
    const entries = await this.rows(sql`SELECT e.*, u.display_name AS name, u.photo_key IS NOT NULL AS has, u.photo_at, u.avatar,
        (SELECT string_agg(cl.name || CASE WHEN cl.section <> '' THEN ' ' || cl.section ELSE '' END, ', ') FROM enrolments en JOIN classes cl ON cl.id = en.class_id WHERE en.student_id = e.student_id) AS class_name,
        (SELECT count(*)::int FROM competition_votes v WHERE v.entry_id = e.id) AS votes
      FROM competition_entries e JOIN users u ON u.id = e.student_id WHERE e.competition_id = ${id}
      ${kids && c.status !== 'RESULTS' ? (kids.length ? sql`AND e.student_id IN ${kids}` : sql`AND FALSE`) : sql``}
      ORDER BY e.place NULLS LAST, e.created_at`);
    const [mine] = await this.rows(sql`SELECT entry_id FROM competition_votes WHERE competition_id = ${id} AND voter_id = ${this.ctx.userId}`);
    const classNames = c.class_ids?.length ? (await this.rows(sql`SELECT name || CASE WHEN section <> '' THEN ' ' || section ELSE '' END AS n FROM classes WHERE id IN ${c.class_ids}`)).map((r) => r.n) : [];
    // teachers: who in my classes has entered, and who not yet
    let roster: any[] | null = null;
    if (this.staff) {
      const mineCls = admin ? null : await this.access.teacherClassIds();
      const target = c.class_ids?.length ? c.class_ids.filter((x: string) => !mineCls || mineCls.includes(x)) : mineCls;
      roster = await this.rows(sql`SELECT DISTINCT u.id, u.display_name AS name, cl.name || CASE WHEN cl.section <> '' THEN ' ' || cl.section ELSE '' END AS class_name,
          EXISTS (SELECT 1 FROM competition_entries e WHERE e.competition_id = ${id} AND e.student_id = u.id) AS entered
        FROM enrolments en JOIN users u ON u.id = en.student_id AND u.status = 'ACTIVE' JOIN classes cl ON cl.id = en.class_id AND NOT cl.archived
        WHERE ${target === null ? sql`TRUE` : target.length ? sql`en.class_id IN ${target}` : sql`FALSE`} ORDER BY class_name, name LIMIT 2000`);
    }
    return {
      id: c.id, title: c.title, category: c.category, emoji: c.emoji, description: c.description, entryKind: c.entry_kind, status: c.status, classIds: c.class_ids, classNames,
      entriesUntil: c.entries_until, votingUntil: c.voting_until, studentVotes: c.student_votes, teacherVotes: c.teacher_votes, resultsNote: c.results_note, resultsAt: c.results_at,
      admin, staff: this.staff, canEnter: this.is('STUDENT') && c.status === 'OPEN' && (!c.entries_until || new Date(c.entries_until) > new Date()),
      canVote: this.canVote(c), myVote: mine?.entry_id ?? null, roster,
      entries: entries.map((e) => ({ id: e.id, studentId: e.student_id, name: e.name, className: e.class_name, title: e.title, description: e.description, place: e.place,
        picture: pictureUrl(e.student_id, e.has, e.photo_at, e.avatar), image: e.image_key ? `/api/competitions/${id}/entries/${e.id}/image?v=${new Date(e.updated_at).getTime()}` : null,
        audioId: e.audio_id, mine: e.student_id === this.ctx.userId, votes: showVotes ? e.votes : null })),
    };
  }

  // ---------------- the school admin ----------------
  private async audience(classIds: string[]) {
    return this.rows(classIds.length
      ? sql`SELECT DISTINCT u.id FROM enrolments e JOIN users u ON u.id = e.student_id AND u.status = 'ACTIVE' WHERE e.class_id IN ${classIds}`
      : sql`SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'STUDENT' WHERE u.school_id = ${this.ctx.schoolId} AND u.status = 'ACTIVE'`);
  }
  private async staffOf() {
    return this.rows(sql`SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role IN ('TEACHER', 'SCHOOL_ADMIN') WHERE u.school_id = ${this.ctx.schoolId} AND u.status = 'ACTIVE' AND u.id <> ${this.ctx.userId}`);
  }
  async create(d: CompetitionDto) {
    const classIds = [...new Set(d.classIds ?? [])];
    if (classIds.length) { const ok = await this.rows(sql`SELECT id FROM classes WHERE id IN ${classIds}`); if (ok.length !== classIds.length) throw new BadRequestException('Unknown class'); }
    const [c] = await this.rows(sql`INSERT INTO competitions (publisher_id, school_id, title, category, emoji, description, entry_kind, class_ids, entries_until, voting_until, student_votes, teacher_votes, created_by)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${d.title.trim()}, ${d.category}, ${(d.emoji || '🏆').slice(0, 16)}, ${(d.description ?? '').trim()}, ${d.entryKind},
        ${`{${classIds.join(',')}}`}::uuid[], ${d.entriesUntil ?? null}, ${d.votingUntil ?? null}, ${d.studentVotes ?? true}, ${d.teacherVotes ?? true}, ${this.ctx.userId}) RETURNING id`);
    const kids = await this.audience(classIds);
    const parents = kids.length ? await this.rows(sql`SELECT DISTINCT parent_id AS id FROM parent_students WHERE student_id IN ${kids.map((k) => k.id)}`) : [];
    const title = `${d.emoji || '🏆'} New competition: ${d.title.trim()} — take part!`.slice(0, 200);
    await this.notifications.notify(kids, { kind: 'COMPETITION', title, body: (d.description ?? '').slice(0, 300), link: `/learn/competitions/${c.id}` });
    await this.notifications.notify(parents, { kind: 'COMPETITION', title, link: `/parent/competitions/${c.id}` });
    await this.notifications.notify(await this.staffOf(), { kind: 'COMPETITION', title, link: `/teacher/competitions/${c.id}` });
    await this.audit.log('competition.create', 'competition', c.id, `Started the competition “${d.title}”`);
    return { id: c.id };
  }
  async update(id: string, d: CompetitionDto) {
    const c = await this.one(id);
    if (c.status === 'RESULTS') throw new BadRequestException('The results are out; this competition is closed');
    const classIds = [...new Set(d.classIds ?? [])];
    await this.rows(sql`UPDATE competitions SET title = ${d.title.trim()}, category = ${d.category}, emoji = ${(d.emoji || '🏆').slice(0, 16)}, description = ${(d.description ?? '').trim()},
      entry_kind = ${d.entryKind}, class_ids = ${`{${classIds.join(',')}}`}::uuid[], entries_until = ${d.entriesUntil ?? null}, voting_until = ${d.votingUntil ?? null},
      student_votes = ${d.studentVotes ?? true}, teacher_votes = ${d.teacherVotes ?? true} WHERE id = ${id}`);
    return { ok: true };
  }
  /** Open the voting (or go back to collecting entries). Voters are told. */
  async setStatus(id: string, status: 'OPEN' | 'VOTING') {
    const c = await this.one(id);
    if (c.status === 'RESULTS') throw new BadRequestException('The results are already out');
    await this.rows(sql`UPDATE competitions SET status = ${status} WHERE id = ${id}`);
    if (status === 'VOTING' && c.status !== 'VOTING') {
      const title = `🗳️ Voting is open: ${c.title}`.slice(0, 200);
      if (c.student_votes) await this.notifications.notify(await this.audience(c.class_ids ?? []), { kind: 'COMPETITION', title, body: 'Look at the entries and vote for your favourite!', link: `/learn/competitions/${id}` });
      if (c.teacher_votes) await this.notifications.notify(await this.staffOf(), { kind: 'COMPETITION', title, link: `/teacher/competitions/${id}` });
    }
    return { status };
  }
  async remove(id: string) {
    await this.one(id);
    const files = await this.rows(sql`SELECT image_key FROM competition_entries WHERE competition_id = ${id} AND image_key IS NOT NULL`);
    await this.rows(sql`DELETE FROM competitions WHERE id = ${id}`);
    for (const f of files) this.assets.driver.remove(f.image_key).catch(() => undefined);
    return { ok: true };
  }
  /** Announce the winners: 1st, 2nd and 3rd place (more than one per place is fine). Optionally on the timeline and in the Hall of Fame. */
  async results(id: string, d: ResultsDto) {
    const c = await this.one(id);
    const ids = d.places.map((p) => p.entryId);
    const ok = ids.length ? await this.rows(sql`SELECT e.id, e.student_id, u.display_name AS name FROM competition_entries e JOIN users u ON u.id = e.student_id WHERE e.competition_id = ${id} AND e.id IN ${ids}`) : [];
    if (ok.length !== new Set(ids).size) throw new BadRequestException('An entry is not in this competition');
    if (!ids.length) throw new BadRequestException('Choose at least one winner');
    await this.rows(sql`UPDATE competition_entries SET place = NULL WHERE competition_id = ${id}`);
    for (const p of d.places) await this.rows(sql`UPDATE competition_entries SET place = ${p.place} WHERE id = ${p.entryId}`);
    await this.rows(sql`UPDATE competitions SET status = 'RESULTS', results_at = now(), results_note = ${(d.note ?? '').trim()} WHERE id = ${id}`);
    const medal = ['🥇', '🥈', '🥉'];
    const winners = d.places.slice().sort((a, b) => a.place - b.place).map((p) => ({ ...p, ...ok.find((o) => o.id === p.entryId)! }));
    const line = winners.map((w) => `${medal[w.place - 1]} ${w.name}`).join('  ');
    const title = `${c.emoji} Results: ${c.title} — ${line}`.slice(0, 200);
    const kids = await this.audience(c.class_ids ?? []);
    const parents = kids.length ? await this.rows(sql`SELECT DISTINCT parent_id AS id FROM parent_students WHERE student_id IN ${kids.map((k) => k.id)}`) : [];
    await this.notifications.notify(kids, { kind: 'COMPETITION', title, body: d.note ?? '', link: `/learn/competitions/${id}` });
    await this.notifications.notify(parents, { kind: 'COMPETITION', title, body: d.note ?? '', link: `/parent/competitions/${id}` });
    await this.notifications.notify(await this.staffOf(), { kind: 'COMPETITION', title, link: `/teacher/competitions/${id}` });
    if (d.toTimeline) {
      const body = `${winners.map((w) => `${medal[w.place - 1]} ${w.name}`).join('\n')}${d.note?.trim() ? `\n\n${d.note.trim()}` : ''}\n\nCongratulations to everyone who took part! 👏`;
      const cls = (c.class_ids ?? []).length === 1 ? c.class_ids[0] : null;
      await this.rows(sql`INSERT INTO timeline_posts (publisher_id, school_id, author_id, class_id, kind, title, body, pinned)
        VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${this.ctx.userId}, ${cls}, 'POST', ${`${c.emoji} ${c.title}: the winners`.slice(0, 200)}, ${body.slice(0, 5000)}, false)`);
    }
    if (d.toFame) for (const w of winners.filter((x) => x.place === 1))
      await this.rows(sql`INSERT INTO hall_of_fame (publisher_id, school_id, kind, user_id, name, title, achievement, year, emoji, created_by)
        VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, 'STUDENT', ${w.student_id}, ${w.name}, ${`Winner: ${c.title}`.slice(0, 120)}, ${`1st place in the ${c.title}`.slice(0, 600)},
          ${String(new Date().getFullYear())}, ${c.emoji}, ${this.ctx.userId})`);
    await this.audit.log('competition.results', 'competition', id, `Announced the results of “${c.title}”`);
    return { ok: true };
  }

  // ---------------- students ----------------
  async upload(image: string) {
    const m = IMAGE.exec(image); if (!m) throw new BadRequestException('Send a JPEG, PNG or WebP picture');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length < 100 || buf.length > 1_000_000) throw new BadRequestException('The picture must be smaller than 1 MB');
    const ok = m[1] === 'jpeg' ? buf[0] === 0xff && buf[1] === 0xd8 : m[1] === 'png' ? buf[0] === 0x89 && buf[1] === 0x50 : buf.subarray(8, 12).toString() === 'WEBP';
    if (!ok) throw new BadRequestException('This is not a picture');
    const key = `${this.ctx.publisherId}/competitions/${this.ctx.schoolId}/${this.ctx.userId}-${randomBytes(8).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    const tmp = path.join(appTmp('uploads'), randomBytes(12).toString('hex'));
    await fs.promises.writeFile(tmp, buf);
    try { await this.assets.driver.putFile(key, tmp, `image/${m[1]}`); } finally { fs.promises.rm(tmp, { force: true }).catch(() => undefined); }
    return { key };
  }
  async enter(id: string, d: EntryDto) {
    const c = await this.one(id);
    if (c.status !== 'OPEN' || (c.entries_until && new Date(c.entries_until) < new Date())) throw new BadRequestException('Entries are closed for this competition');
    const [old] = await this.rows(sql`SELECT image_key FROM competition_entries WHERE competition_id = ${id} AND student_id = ${this.ctx.userId}`);
    // no imageKey sent = keep the picture already there
    const image = d.imageKey === undefined ? old?.image_key ?? null : d.imageKey; const audio = d.audioId ?? null;
    if (image && image !== old?.image_key && !image.startsWith(`${this.ctx.publisherId}/competitions/${this.ctx.schoolId}/${this.ctx.userId}-`)) throw new BadRequestException('Unknown picture');
    if (audio) { const [a] = await this.rows(sql`SELECT 1 FROM audio_clips WHERE id = ${audio} AND owner_id = ${this.ctx.userId} AND kind = 'ENTRY'`); if (!a) throw new BadRequestException('Record your entry again'); }
    const text = (d.description ?? '').trim();
    const need = c.entry_kind;
    if (need === 'PHOTO' && !image) throw new BadRequestException('Add a photo of your entry');
    if (need === 'AUDIO' && !audio) throw new BadRequestException('Record your entry');
    if (need === 'TEXT' && !text) throw new BadRequestException('Write your entry');
    if (!image && !audio && !text) throw new BadRequestException('Add a photo, a recording or some writing');
    const [e] = await this.rows(sql`INSERT INTO competition_entries (publisher_id, school_id, competition_id, student_id, title, description, image_key, audio_id)
      VALUES (${this.ctx.publisherId}, ${this.ctx.schoolId}, ${id}, ${this.ctx.userId}, ${(d.title ?? '').trim()}, ${text}, ${image}, ${audio})
      ON CONFLICT (competition_id, student_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, image_key = EXCLUDED.image_key, audio_id = EXCLUDED.audio_id, updated_at = now()
      RETURNING id`);
    if (old?.image_key && old.image_key !== image) this.assets.driver.remove(old.image_key).catch(() => undefined);
    return { id: e.id };
  }
  async withdraw(id: string) {
    const c = await this.one(id);
    if (c.status !== 'OPEN') throw new BadRequestException('Entries are closed; you cannot take it back now');
    const r = await this.rows(sql`DELETE FROM competition_entries WHERE competition_id = ${id} AND student_id = ${this.ctx.userId} RETURNING image_key`);
    if (r[0]?.image_key) this.assets.driver.remove(r[0].image_key).catch(() => undefined);
    return { ok: true };
  }
  /** One vote per person (it can be changed while voting is open); never for your own entry. */
  async vote(id: string, entryId: string) {
    const c = await this.one(id);
    if (!this.canVote(c)) throw new ForbiddenException(c.status !== 'VOTING' ? 'Voting is not open' : 'You cannot vote in this competition');
    const [e] = await this.rows(sql`SELECT student_id FROM competition_entries WHERE id = ${entryId} AND competition_id = ${id}`);
    if (!e) throw new NotFoundException('Entry not found');
    if (e.student_id === this.ctx.userId) throw new BadRequestException('You cannot vote for your own entry');
    await this.rows(sql`INSERT INTO competition_votes (competition_id, voter_id, entry_id, publisher_id, school_id) VALUES (${id}, ${this.ctx.userId}, ${entryId}, ${this.ctx.publisherId}, ${this.ctx.schoolId})
      ON CONFLICT (competition_id, voter_id) DO UPDATE SET entry_id = EXCLUDED.entry_id, created_at = now()`);
    return { myVote: entryId };
  }
  async image(id: string, entryId: string) {
    await this.one(id);
    const [e] = await this.rows(sql`SELECT image_key FROM competition_entries WHERE id = ${entryId} AND competition_id = ${id}`);
    if (!e?.image_key) throw new NotFoundException('No picture');
    const ext = e.image_key.split('.').pop();
    return { stream: await this.assets.driver.read(e.image_key), mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' };
  }
}

const ALL = ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'];
@ApiTags('competitions')
@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly svc: CompetitionsService) {}
  @Roles(...ALL) @Get() list() { return this.svc.list(); }
  @Roles('STUDENT') @Post('uploads') @HttpCode(200) upload(@Body() d: UploadDto) { return this.svc.upload(d.image); }
  @Roles(...ALL) @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.detail(id); }
  @Roles('SCHOOL_ADMIN') @Post() create(@Body() d: CompetitionDto) { return this.svc.create(d); }
  @Roles('SCHOOL_ADMIN') @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() d: CompetitionDto) { return this.svc.update(id, d); }
  @Roles('SCHOOL_ADMIN') @Post(':id/status') @HttpCode(200) status(@Param('id', ParseUUIDPipe) id: string, @Body() d: StatusDto) { return this.svc.setStatus(id, d.status); }
  @Roles('SCHOOL_ADMIN') @Post(':id/results') @HttpCode(200) results(@Param('id', ParseUUIDPipe) id: string, @Body() d: ResultsDto) { return this.svc.results(id, d); }
  @Roles('SCHOOL_ADMIN') @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(id); }
  @Roles('STUDENT') @Post(':id/entry') enter(@Param('id', ParseUUIDPipe) id: string, @Body() d: EntryDto) { return this.svc.enter(id, d); }
  @Roles('STUDENT') @Delete(':id/entry') withdraw(@Param('id', ParseUUIDPipe) id: string) { return this.svc.withdraw(id); }
  @Roles('STUDENT', 'TEACHER', 'SCHOOL_ADMIN') @Post(':id/vote') @HttpCode(200) vote(@Param('id', ParseUUIDPipe) id: string, @Body() d: VoteDto) { return this.svc.vote(id, d.entryId); }
  @SkipThrottle() @Roles(...ALL) @Get(':id/entries/:eid/image')
  async image(@Param('id', ParseUUIDPipe) id: string, @Param('eid', ParseUUIDPipe) eid: string, @Res() res: Response) {
    const f = await this.svc.image(id, eid);
    res.setHeader('Content-Type', f.mime); res.setHeader('Cache-Control', 'private, max-age=604800'); res.setHeader('X-Content-Type-Options', 'nosniff');
    f.stream.on('error', () => res.destroy()).pipe(res);
  }
}
