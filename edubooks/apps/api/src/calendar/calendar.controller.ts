import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, PartialType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { and, asc, eq, gte, isNull, lte, or, sql, SQL } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { calendarEvents, curricula, schools } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { Roles } from '../common/decorators';
import { NotificationsService } from '../notifications/notifications.service';

export const CAL_KINDS = ['TERM', 'HOLIDAY', 'EXAM', 'EVENT', 'MEETING', 'SPORTS', 'OTHER'] as const;
export class EventDto {
  @IsString() @Length(1, 160) title: string;
  @IsIn(CAL_KINDS) kind: (typeof CAL_KINDS)[number];
  @IsDateString() startsOn: string;
  @IsDateString() endsOn: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  /** Publisher events only: show to schools following this curriculum (empty = all schools). */
  @IsOptional() @IsUUID() curriculumId?: string | null;
}
class UpdateEventDto extends PartialType(EventDto) {}
class RangeDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsUUID() curriculumId?: string;
  @IsOptional() @IsUUID() schoolId?: string;
}

@Injectable()
export class CalendarService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}
  private get q() { return this.db.q; }
  private get staff() { return !!this.db.ctx.staff; }

  /**
   * Publisher staff: every publisher event (optionally one curriculum) and, when a school is chosen, that school's events.
   * School users: publisher events for all schools or for their school's curriculum, plus their own school's events (RLS).
   */
  async list(r: RangeDto) {
    if (r.to < r.from) throw new BadRequestException('"to" is before "from"');
    const w: SQL[] = [lte(calendarEvents.startsOn, r.to), gte(calendarEvents.endsOn, r.from)];
    if (this.staff) {
      w.push(r.schoolId ? or(isNull(calendarEvents.schoolId), eq(calendarEvents.schoolId, r.schoolId))! : isNull(calendarEvents.schoolId));
      if (r.curriculumId) w.push(or(isNull(calendarEvents.curriculumId), eq(calendarEvents.curriculumId, r.curriculumId))!);
    } else {
      const sid = this.db.ctx.schoolId!;
      const [s] = await this.q.select({ c: schools.curriculumId }).from(schools).where(eq(schools.id, sid));
      w.push(or(
        eq(calendarEvents.schoolId, sid),
        and(isNull(calendarEvents.schoolId), s?.c ? or(isNull(calendarEvents.curriculumId), eq(calendarEvents.curriculumId, s.c)) : isNull(calendarEvents.curriculumId)),
      )!);
    }
    return this.q.select({
      id: calendarEvents.id, title: calendarEvents.title, kind: calendarEvents.kind, startsOn: calendarEvents.startsOn, endsOn: calendarEvents.endsOn,
      description: calendarEvents.description, schoolId: calendarEvents.schoolId, curriculumId: calendarEvents.curriculumId, isTemplate: calendarEvents.isTemplate,
      curriculumName: curricula.name,
      editable: this.staff ? sql<boolean>`true` : sql<boolean>`${calendarEvents.schoolId} IS NOT NULL AND ${this.db.ctx.roles?.includes('SCHOOL_ADMIN') ?? false}`,
    }).from(calendarEvents).leftJoin(curricula, eq(curricula.id, calendarEvents.curriculumId))
      .where(and(...w)).orderBy(asc(calendarEvents.startsOn), asc(calendarEvents.title)).limit(1000);
  }

  private async check(d: Partial<EventDto>) {
    if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) throw new BadRequestException('The end date is before the start date');
    if (d.curriculumId) {
      if (!this.staff) throw new ForbiddenException('Only the publisher can target a curriculum');
      const [c] = await this.q.select({ id: curricula.id }).from(curricula).where(eq(curricula.id, d.curriculumId));
      if (!c) throw new BadRequestException('Unknown curriculum');
    }
  }

  async create(d: EventDto) {
    await this.check(d);
    const [row] = await this.q.insert(calendarEvents).values({
      publisherId: this.db.ctx.publisherId, schoolId: this.staff ? null : this.db.ctx.schoolId, curriculumId: this.staff ? d.curriculumId ?? null : null,
      title: d.title.trim(), kind: d.kind, startsOn: d.startsOn, endsOn: d.endsOn, description: d.description ?? '', createdBy: this.db.ctx.userId,
    }).returning();
    await this.audit.log('calendar.create', 'calendar_event', row.id, `Added “${row.title}” (${row.startsOn}) to the calendar`, undefined, row, row.schoolId);
    if (row.schoolId && row.kind !== 'TERM') await this.announce(row);
    return row;
  }

  /** School events reach teachers and students in the app, and parents also by WhatsApp/SMS. */
  private async announce(e: typeof calendarEvents.$inferSelect) {
    const when = e.startsOn === e.endsOn ? e.startsOn : `${e.startsOn} – ${e.endsOn}`;
    const msg = { kind: 'CALENDAR', title: `${e.title} (${when})`, body: e.description?.slice(0, 300) || 'Added to the school calendar.' };
    const { rows: people } = await this.q.execute(sql`
      SELECT u.id, u.phone, bool_or(r.role::text = 'PARENT') AS parent, bool_or(r.role::text = 'TEACHER') AS teacher FROM users u JOIN user_roles r ON r.user_id = u.id
      WHERE u.school_id = ${e.schoolId} AND u.status = 'ACTIVE' AND r.role::text IN ('TEACHER', 'STUDENT', 'PARENT') GROUP BY u.id, u.phone`);
    const all = people as any[];
    await this.notifications.notify(all.filter((p) => p.teacher), { ...msg, link: '/teacher/calendar' });
    await this.notifications.notify(all.filter((p) => !p.parent && !p.teacher), { ...msg, link: '/learn' });
    await this.notifications.notify(all.filter((p) => p.parent), { ...msg, link: '/parent' }, { phone: true });
  }

  private async own(id: string) {
    const [e] = await this.q.select().from(calendarEvents).where(eq(calendarEvents.id, id));
    if (!e) throw new NotFoundException('Event not found');
    if (!this.staff && e.schoolId !== this.db.ctx.schoolId) throw new ForbiddenException('This event belongs to the publisher calendar');
    return e;
  }

  async update(id: string, d: Partial<EventDto>) {
    const e = await this.own(id);
    await this.check({ startsOn: d.startsOn ?? e.startsOn, endsOn: d.endsOn ?? e.endsOn, curriculumId: d.curriculumId });
    const [row] = await this.q.update(calendarEvents).set({ ...d, ...(this.staff ? {} : { curriculumId: null }), isTemplate: false, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id)).returning();
    await this.audit.log('calendar.update', 'calendar_event', id, `Updated “${row.title}”`, e, row, row.schoolId);
    return row;
  }

  async remove(id: string) {
    const e = await this.own(id);
    await this.q.delete(calendarEvents).where(eq(calendarEvents.id, id));
    await this.audit.log('calendar.delete', 'calendar_event', id, `Removed “${e.title}” from the calendar`, e, undefined, e.schoolId);
    return { ok: true };
  }
}

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly svc: CalendarService) {}
  @Get() list(@Query() r: RangeDto) { return this.svc.list(r); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'SCHOOL_ADMIN') @Post() create(@Body() d: EventDto) { return this.svc.create(d); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'SCHOOL_ADMIN') @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateEventDto) { return this.svc.update(id, d); }
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'SCHOOL_ADMIN') @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(id); }
}

@Module({ controllers: [CalendarController], providers: [CalendarService] })
export class CalendarModule {}
