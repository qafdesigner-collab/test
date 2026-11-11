import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, classes, timetablePeriods, timetableSlots } from '../db/schema';
import { Roles } from '../common/decorators';
import { AccessService } from '../lms/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LmsModule } from '../lms/lms.module';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const Id = () => new ParseUUIDPipe();
const todayIso = () => new Date().toISOString().slice(0, 10);
const arr = (ids: string[]) => `{${ids.join(',')}}`;

class MarkDto {
  @IsUUID() studentId!: string;
  @IsIn(STATUSES as unknown as string[]) status!: (typeof STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
class SaveAttendanceDto {
  @Matches(DAY, { message: 'day must look like 2026-01-31' }) day!: string;
  @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => MarkDto) records!: MarkDto[];
  @IsOptional() @IsBoolean() notifyParents?: boolean;
}
class PeriodDto {
  @IsInt() @Min(1) @Max(20) number!: number;
  @IsOptional() @IsString() @MaxLength(40) label?: string;
  @Matches(TIME, { message: 'times look like 08:00' }) startsAt!: string;
  @Matches(TIME, { message: 'times look like 08:00' }) endsAt!: string;
  @IsOptional() @IsBoolean() isBreak?: boolean;
}
class PeriodsDto { @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PeriodDto) periods!: PeriodDto[]; }
class SlotDto {
  @IsInt() @Min(1) @Max(7) weekday!: number;
  @IsInt() @Min(1) @Max(20) period!: number;
  @IsOptional() @IsUUID() subjectId?: string | null;
  @IsOptional() @IsUUID() teacherId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) room?: string;
}
class SlotsDto { @IsArray() @ArrayMaxSize(140) @ValidateNested({ each: true }) @Type(() => SlotDto) slots!: SlotDto[]; }

@Injectable()
export class AttendanceService {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly notifications: NotificationsService) {}
  private get q() { return this.db.q; }
  private get ctx() { return this.db.ctx; }
  private async rows(s: ReturnType<typeof sql>) { return (await this.q.execute(s)).rows as any[]; }

  // ------------------------------------------------------------ attendance
  async register(classId: string, day = todayIso()) {
    if (!DAY.test(day)) throw new BadRequestException('day must look like 2026-01-31');
    const c = await this.access.assertTeaches(classId);
    const roster = await this.rows(sql`SELECT u.id, u.display_name AS "displayName", u.username, a.status, coalesce(a.note, '') AS note
      FROM enrolments e JOIN users u ON u.id = e.student_id LEFT JOIN attendance a ON a.class_id = e.class_id AND a.student_id = u.id AND a.day = ${day}::date
      WHERE e.class_id = ${classId} AND u.status = 'ACTIVE' ORDER BY u.display_name`);
    const count = (s: string) => roster.filter((r) => r.status === s).length;
    return { class: { id: c.id, name: c.name, section: c.section }, day, marked: roster.some((r) => r.status),
      summary: { PRESENT: count('PRESENT'), ABSENT: count('ABSENT'), LATE: count('LATE'), EXCUSED: count('EXCUSED'), total: roster.length }, roster };
  }

  async save(classId: string, d: SaveAttendanceDto) {
    await this.access.assertTeaches(classId);
    if (d.day > todayIso()) throw new BadRequestException('You cannot mark attendance for a future day');
    const enrolled = new Set(await this.access.studentIdsOf(classId));
    const bad = d.records.find((r) => !enrolled.has(r.studentId));
    if (bad) throw new BadRequestException('Some students are not in this class');
    if (!d.records.length) return { saved: 0, notified: 0 };
    const before = await this.rows(sql`SELECT student_id, status FROM attendance WHERE class_id = ${classId} AND day = ${d.day}::date`);
    const was = new Map(before.map((r) => [r.student_id, r.status]));
    await this.q.insert(attendance).values(d.records.map((r) => ({ publisherId: this.ctx.publisherId, schoolId: this.ctx.schoolId!, classId, studentId: r.studentId,
      day: d.day, status: r.status, note: r.note ?? '', markedBy: this.ctx.userId })))
      .onConflictDoUpdate({ target: [attendance.classId, attendance.studentId, attendance.day],
        set: { status: sql`excluded.status`, note: sql`excluded.note`, markedBy: this.ctx.userId, updatedAt: new Date() } });
    // Tell parents about a new absence on today's register only (not when correcting old days).
    const newlyAbsent = d.records.filter((r) => r.status === 'ABSENT' && was.get(r.studentId) !== 'ABSENT').map((r) => r.studentId);
    let notified = 0;
    if (d.notifyParents !== false && d.day === todayIso() && newlyAbsent.length) {
      const parents = await this.rows(sql`SELECT DISTINCT u.id, u.phone, k.display_name AS child FROM parent_students ps JOIN users u ON u.id = ps.parent_id JOIN users k ON k.id = ps.student_id
        WHERE ps.student_id = ANY(${arr(newlyAbsent)}::uuid[]) AND u.status = 'ACTIVE'`);
      for (const p of parents) {
        await this.notifications.notify([{ id: p.id, phone: p.phone }], { kind: 'ABSENCE', title: `${p.child} was marked absent today`,
          body: 'If this is unexpected, please contact the school.', link: '/parent' }, { phone: true });
        notified++;
      }
    }
    return { saved: d.records.length, notified };
  }

  /** Per-student totals and a day-by-day grid for a date range (default: this month). */
  async classReport(classId: string, from?: string, to?: string) {
    const c = await this.access.assertTeaches(classId);
    const end = to && DAY.test(to) ? to : todayIso(); const start = from && DAY.test(from) ? from : end.slice(0, 8) + '01';
    if (start > end) throw new BadRequestException('The start date is after the end date');
    const days = (await this.rows(sql`SELECT DISTINCT to_char(day, 'YYYY-MM-DD') AS day FROM attendance WHERE class_id = ${classId} AND day BETWEEN ${start}::date AND ${end}::date ORDER BY 1`)).map((r) => r.day);
    const marks = await this.rows(sql`SELECT student_id, to_char(day, 'YYYY-MM-DD') AS day, status FROM attendance WHERE class_id = ${classId} AND day BETWEEN ${start}::date AND ${end}::date`);
    const roster = await this.rows(sql`SELECT u.id, u.display_name AS "displayName" FROM enrolments e JOIN users u ON u.id = e.student_id WHERE e.class_id = ${classId} ORDER BY u.display_name`);
    const students = roster.map((s) => {
      const mine = marks.filter((m) => m.student_id === s.id);
      const by = (st: string) => mine.filter((m) => m.status === st).length;
      const attended = by('PRESENT') + by('LATE');
      return { ...s, days: Object.fromEntries(mine.map((m) => [m.day, m.status])), present: by('PRESENT'), absent: by('ABSENT'), late: by('LATE'), excused: by('EXCUSED'),
        rate: mine.length ? Math.round((attended / mine.length) * 100) : null };
    });
    return { class: { id: c.id, name: c.name, section: c.section }, from: start, to: end, days, students };
  }

  /** School admin: which classes have marked today, with counts. */
  async schoolDay(day = todayIso()) {
    if (!DAY.test(day)) throw new BadRequestException('day must look like 2026-01-31');
    const list = await this.rows(sql`SELECT c.id, c.name, c.section,
        (SELECT count(*) FROM enrolments e WHERE e.class_id = c.id)::int AS students,
        count(a.id) FILTER (WHERE a.status = 'PRESENT')::int AS present, count(a.id) FILTER (WHERE a.status = 'ABSENT')::int AS absent,
        count(a.id) FILTER (WHERE a.status = 'LATE')::int AS late, count(a.id) FILTER (WHERE a.status = 'EXCUSED')::int AS excused, count(a.id)::int AS marked
      FROM classes c JOIN academic_years y ON y.id = c.academic_year_id LEFT JOIN attendance a ON a.class_id = c.id AND a.day = ${day}::date
      WHERE NOT c.archived AND current_date BETWEEN y.starts_on AND y.ends_on GROUP BY c.id ORDER BY c.name, c.section`);
    const t = (k: string) => list.reduce((n, c) => n + c[k], 0);
    return { day, classes: list, totals: { students: t('students'), present: t('present'), absent: t('absent'), late: t('late'), excused: t('excused'), marked: t('marked'),
      unmarkedClasses: list.filter((c) => c.students && !c.marked).length } };
  }

  myHistory() { return this.studentHistory(this.ctx.userId); }
  async childAttendance(childId: string) {
    const ok = await this.rows(sql`SELECT 1 FROM parent_students WHERE parent_id = ${this.ctx.userId} AND student_id = ${childId}`);
    if (!ok.length) throw new ForbiddenException('Not your child');
    return this.studentHistory(childId);
  }
  async studentHistory(studentId: string) {
    const rows = await this.rows(sql`SELECT to_char(day, 'YYYY-MM-DD') AS day, status, note FROM attendance WHERE student_id = ${studentId} AND day > current_date - 120 ORDER BY day DESC`);
    const by = (s: string) => rows.filter((r) => r.status === s).length;
    return { days: rows, present: by('PRESENT'), absent: by('ABSENT'), late: by('LATE'), excused: by('EXCUSED'),
      rate: rows.length ? Math.round(((by('PRESENT') + by('LATE')) / rows.length) * 100) : null };
  }

  // ------------------------------------------------------------ timetable
  periods() {
    return this.rows(sql`SELECT number, label, to_char(starts_at, 'HH24:MI') AS "startsAt", to_char(ends_at, 'HH24:MI') AS "endsAt", is_break AS "isBreak"
      FROM timetable_periods ORDER BY number`);
  }

  async setPeriods(d: PeriodsDto) {
    const nums = d.periods.map((p) => p.number);
    if (new Set(nums).size !== nums.length) throw new BadRequestException('Each period number may appear once');
    const bad = d.periods.find((p) => p.endsAt <= p.startsAt);
    if (bad) throw new BadRequestException(`Period ${bad.number} must end after it starts`);
    const sorted = [...d.periods].sort((a, b) => a.number - b.number);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].startsAt < sorted[i - 1].endsAt) throw new BadRequestException(`Period ${sorted[i].number} starts before period ${sorted[i - 1].number} ends`);
    await this.q.delete(timetablePeriods).where(eq(timetablePeriods.schoolId, this.ctx.schoolId!));
    if (sorted.length) await this.q.insert(timetablePeriods).values(sorted.map((p) => ({ publisherId: this.ctx.publisherId, schoolId: this.ctx.schoolId!, number: p.number,
      label: p.label?.trim() ?? '', startsAt: p.startsAt, endsAt: p.endsAt, isBreak: !!p.isBreak })));
    return this.periods();
  }

  private slotRows(where: ReturnType<typeof sql>) {
    return this.rows(sql`SELECT t.id, t.class_id AS "classId", t.weekday, t.period, t.subject_id AS "subjectId", s.name AS subject, s.color, t.teacher_id AS "teacherId",
        u.display_name AS teacher, t.room, c.name AS "className", c.section
      FROM timetable_slots t JOIN classes c ON c.id = t.class_id LEFT JOIN subjects s ON s.id = t.subject_id LEFT JOIN users u ON u.id = t.teacher_id
      WHERE ${where} ORDER BY t.weekday, t.period`);
  }

  private async canSeeClass(classId: string) {
    const [c] = await this.q.select({ id: classes.id, name: classes.name, section: classes.section }).from(classes).where(eq(classes.id, classId));
    if (!c) throw new NotFoundException('Class not found');
    if (this.access.is('SCHOOL_ADMIN') || this.access.is('TEACHER')) return c;
    if ((await this.access.studentClassIds()).includes(classId)) return c;
    const kid = await this.rows(sql`SELECT 1 FROM parent_students ps JOIN enrolments e ON e.student_id = ps.student_id WHERE ps.parent_id = ${this.ctx.userId} AND e.class_id = ${classId}`);
    if (kid.length) return c;
    throw new ForbiddenException('Not your class');
  }

  async classTimetable(classId: string) {
    const c = await this.canSeeClass(classId);
    return { class: c, periods: await this.periods(), slots: await this.slotRows(sql`t.class_id = ${classId}`) };
  }

  async setClassTimetable(classId: string, d: SlotsDto) {
    const [c] = await this.q.select().from(classes).where(eq(classes.id, classId));
    if (!c) throw new NotFoundException('Class not found');
    const keys = d.slots.map((s) => `${s.weekday}-${s.period}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Two lessons are in the same period');
    const teacherIds = [...new Set(d.slots.map((s) => s.teacherId).filter(Boolean))] as string[];
    if (teacherIds.length && (await this.access.schoolUserIds(teacherIds, 'TEACHER')).length !== teacherIds.length) throw new BadRequestException('Unknown teacher');
    // Friendly clash check before the unique index does it.
    for (const s of d.slots.filter((x) => x.teacherId)) {
      const [clash] = await this.rows(sql`SELECT c.name, c.section, u.display_name AS teacher FROM timetable_slots t JOIN classes c ON c.id = t.class_id JOIN users u ON u.id = t.teacher_id
        WHERE t.teacher_id = ${s.teacherId} AND t.weekday = ${s.weekday} AND t.period = ${s.period} AND t.class_id <> ${classId} LIMIT 1`);
      if (clash) throw new ConflictException(`${clash.teacher} already teaches ${clash.name}${clash.section ? ' — ' + clash.section : ''} on ${['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][s.weekday]}, period ${s.period}`);
    }
    await this.q.delete(timetableSlots).where(eq(timetableSlots.classId, classId));
    const real = d.slots.filter((s) => s.subjectId || s.teacherId || s.room?.trim());
    if (real.length) await this.q.insert(timetableSlots).values(real.map((s) => ({ publisherId: this.ctx.publisherId, schoolId: this.ctx.schoolId!, classId,
      weekday: s.weekday, period: s.period, subjectId: s.subjectId ?? null, teacherId: s.teacherId ?? null, room: s.room?.trim() ?? '' })));
    return this.classTimetable(classId);
  }

  /** The signed-in user's own week: a teacher's lessons across classes, or a student's class timetable. */
  async mine() {
    if (this.access.is('TEACHER') && !this.access.is('STUDENT')) return { periods: await this.periods(), slots: await this.slotRows(sql`t.teacher_id = ${this.ctx.userId}`), view: 'teacher' };
    const ids = await this.access.studentClassIds();
    return { periods: await this.periods(), slots: ids.length ? await this.slotRows(sql`t.class_id = ANY(${arr(ids)}::uuid[])`) : [], view: 'class' };
  }

  async childTimetable(childId: string) {
    const ok = await this.rows(sql`SELECT 1 FROM parent_students WHERE parent_id = ${this.ctx.userId} AND student_id = ${childId}`);
    if (!ok.length) throw new ForbiddenException('Not your child');
    const ids = await this.access.studentClassIds(childId);
    return { periods: await this.periods(), slots: ids.length ? await this.slotRows(sql`t.class_id = ANY(${arr(ids)}::uuid[])`) : [], view: 'class' };
  }
}

const TEACHING = ['SCHOOL_ADMIN', 'TEACHER'];
@ApiTags('attendance')
@Controller()
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}
  @Roles(...TEACHING) @Get('attendance/classes/:id') register(@Param('id', Id()) id: string, @Query('day') day?: string) { return this.svc.register(id, day || undefined); }
  @Roles(...TEACHING) @Put('attendance/classes/:id') save(@Param('id', Id()) id: string, @Body() d: SaveAttendanceDto) { return this.svc.save(id, d); }
  @Roles(...TEACHING) @Get('attendance/classes/:id/report') report(@Param('id', Id()) id: string, @Query('from') from?: string, @Query('to') to?: string) { return this.svc.classReport(id, from, to); }
  @Roles('SCHOOL_ADMIN') @Get('attendance/school') school(@Query('day') day?: string) { return this.svc.schoolDay(day || undefined); }
  @Roles('STUDENT') @Get('student/attendance') mineAtt() { return this.svc.myHistory(); }

  @Get('timetable/periods') periods() { return this.svc.periods(); }
  @Roles('SCHOOL_ADMIN') @Put('timetable/periods') setPeriods(@Body() d: PeriodsDto) { return this.svc.setPeriods(d); }
  @Get('timetable/classes/:id') classTt(@Param('id', Id()) id: string) { return this.svc.classTimetable(id); }
  @Roles('SCHOOL_ADMIN') @Put('timetable/classes/:id') setClassTt(@Param('id', Id()) id: string, @Body() d: SlotsDto) { return this.svc.setClassTimetable(id, d); }
  @Roles(...TEACHING, 'STUDENT') @Get('timetable/me') mine() { return this.svc.mine(); }
  @Roles('PARENT') @Get('parent/children/:id/timetable') child(@Param('id', Id()) id: string) { return this.svc.childTimetable(id); }
  @Roles('PARENT') @Get('parent/children/:id/attendance') childAtt(@Param('id', Id()) id: string) { return this.svc.childAttendance(id); }
}

@Module({ imports: [LmsModule], controllers: [AttendanceController], providers: [AttendanceService] })
export class AttendanceModule {}
