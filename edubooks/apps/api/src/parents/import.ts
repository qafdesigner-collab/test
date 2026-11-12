import { BadRequestException, Body, Controller, Injectable, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { sql } from 'drizzle-orm';
import { Roles } from '../common/decorators';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { SchoolUsersService } from '../schools/school-users.service';
import { normalisePhone } from '../notifications/channels';

class ImportRow {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(40) username?: string;
  @IsOptional() @IsString() @MaxLength(200) password?: string;
  @IsOptional() @IsString() @MaxLength(80) className?: string;
  @IsOptional() @IsString() @MaxLength(40) section?: string;
  @IsOptional() @IsString() @MaxLength(120) parentName?: string;
  @IsOptional() @IsString() @MaxLength(30) parentPhone?: string;
  @IsOptional() @IsString() @MaxLength(40) relation?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
}
class ImportDto {
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => ImportRow) rows: ImportRow[];
}
type Issue = { row: number; level: 'error' | 'warning'; message: string };

@Injectable()
export class StudentImportService {
  constructor(private readonly db: DbService, private readonly audit: AuditService, private readonly users: SchoolUsersService) {}
  private get q() { return this.db.q; }

  private async year(id?: string) {
    const school = this.db.ctx.schoolId!;
    const { rows } = await this.q.execute(id
      ? sql`SELECT id, name FROM academic_years WHERE id = ${id} AND school_id = ${school}`
      : sql`SELECT id, name FROM academic_years WHERE school_id = ${school} ORDER BY (current_date BETWEEN starts_on AND ends_on) DESC, starts_on DESC LIMIT 1`);
    return rows[0] as { id: string; name: string } | undefined;
  }

  /** Checks every row; with dryRun nothing is written. Real import is all-or-nothing (one transaction). */
  async run(d: ImportDto, dryRun: boolean) {
    const school = this.db.ctx.schoolId!;
    const issues: Issue[] = [];
    const year = await this.year(d.academicYearId);
    const { rows: classRows } = year ? await this.q.execute(sql`SELECT id, name, section FROM classes WHERE school_id = ${school} AND academic_year_id = ${year.id} AND NOT archived`) : { rows: [] as any[] };
    const classes = classRows as { id: string; name: string; section: string }[];
    const { rows: taken } = await this.q.execute(sql`SELECT lower(username::text) AS u FROM users WHERE school_id = ${school}`);
    const takenSet = new Set((taken as any[]).map((r) => r.u));
    const { rows: parentRows } = await this.q.execute(sql`SELECT u.id, u.display_name AS name, u.phone FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role::text = 'PARENT' WHERE u.school_id = ${school} AND u.phone IS NOT NULL`);
    const existingParents = new Map((parentRows as any[]).map((p) => [normalisePhone(p.phone), p]));
    const seen = new Set<string>(); const seenEmail = new Set<string>();
    const { rows: em } = await this.q.execute(sql`SELECT lower(email::text) AS e FROM users WHERE school_id = ${school} AND email IS NOT NULL`);
    const takenEmail = new Set((em as any[]).map((r) => r.e));
    const plan = d.rows.map((r, i) => {
      const n = i + 2; // spreadsheet row (row 1 = headings)
      const name = r.name?.trim();
      if (!name) issues.push({ row: n, level: 'error', message: 'Name is empty' });
      const username = r.username?.trim().toLowerCase();
      if (username) {
        if (!/^[a-z0-9._-]{3,40}$/.test(username)) issues.push({ row: n, level: 'error', message: `Username “${username}”: 3–40 letters, digits, dot, dash or underscore` });
        else if (takenSet.has(username) || seen.has(username)) issues.push({ row: n, level: 'error', message: `Username “${username}” is already used` });
        seen.add(username);
      }
      const em = r.email?.trim().toLowerCase();
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) issues.push({ row: n, level: 'error', message: `“${em}” is not a valid email` });
      else if (em && (takenEmail.has(em) || seenEmail.has(em))) issues.push({ row: n, level: 'error', message: `Email “${em}” is already used` });
      if (em) seenEmail.add(em);
      if (r.password && r.password.length < 6) issues.push({ row: n, level: 'error', message: 'Password must have at least 6 characters' });
      let classId: string | null = null;
      if (r.className?.trim()) {
        const cn = r.className.trim().toLowerCase(); const sec = (r.section ?? '').trim().toLowerCase();
        const matches = classes.filter((c) => c.name.toLowerCase() === cn && (!sec || c.section.toLowerCase() === sec));
        if (!year) issues.push({ row: n, level: 'error', message: 'Your school has no academic year yet, so classes cannot be assigned' });
        else if (matches.length === 1) classId = matches[0].id;
        else if (!matches.length) issues.push({ row: n, level: 'error', message: `Class “${r.className}${r.section ? ` — ${r.section}` : ''}” not found in ${year.name}. Create it first (Classes page).` });
        else issues.push({ row: n, level: 'error', message: `Several classes are called “${r.className}”: add the Section column` });
      }
      const phone = r.parentPhone?.trim() ? normalisePhone(r.parentPhone) : '';
      if (r.parentPhone?.trim() && phone.length < 9) issues.push({ row: n, level: 'error', message: `Parent mobile “${r.parentPhone}” does not look like a phone number` });
      if (phone && !r.parentName?.trim() && !existingParents.has(phone)) issues.push({ row: n, level: 'warning', message: 'Parent mobile without a parent name: “Parent of …” is used' });
      return { n, name, username, password: r.password || undefined, email: r.email?.trim().toLowerCase() || undefined, classId, parentName: r.parentName?.trim(), parentPhone: r.parentPhone?.trim(), phone, relation: r.relation?.trim() || 'Parent' };
    });
    const errors = issues.filter((x) => x.level === 'error');
    const parentsPlanned = new Set(plan.filter((p) => p.phone && !existingParents.has(p.phone)).map((p) => p.phone)).size + plan.filter((p) => !p.phone && p.parentName).length;
    const summary = { students: plan.length, withClass: plan.filter((p) => p.classId).length, newParents: parentsPlanned, linkedExistingParents: plan.filter((p) => p.phone && existingParents.has(p.phone)).length, year: year?.name ?? null };
    if (dryRun || errors.length) {
      if (!dryRun) throw new BadRequestException({ message: `${errors.length} row(s) have problems. Nothing was imported.`, issues });
      return { ok: !errors.length, summary, issues };
    }

    // ---- write (inside the request transaction: all or nothing)
    const studentCreds = await this.users.create(school, 'STUDENT', plan.map((p) => ({ displayName: p.name!, username: p.username, password: p.password, email: p.email })));
    const parentCreds: any[] = []; const parentByKey = new Map<string, string>();
    for (const [i, p] of plan.entries()) {
      const kid = studentCreds[i];
      if (p.classId && year) await this.q.execute(sql`INSERT INTO enrolments (class_id, student_id, academic_year_id, publisher_id, school_id) VALUES (${p.classId}, ${kid.id}, ${year.id}, ${this.db.ctx.publisherId}, ${school})`);
      if (!p.phone && !p.parentName) continue;
      const key = p.phone || `name:${p.parentName!.toLowerCase()}:${i}`;
      let parentId = existingParents.get(p.phone)?.id ?? parentByKey.get(key);
      if (!parentId) {
        const [pc] = await this.users.create(school, 'PARENT', [{ displayName: p.parentName || `Parent of ${p.name}`, phone: p.parentPhone }]);
        parentId = pc.id; parentByKey.set(key, pc.id); parentCreds.push({ ...pc, children: [p.name] });
      } else parentCreds.find((c) => c.id === parentId)?.children.push(p.name);
      await this.q.execute(sql`INSERT INTO parent_students (parent_id, student_id, publisher_id, school_id, relation) VALUES (${parentId}, ${kid.id}, ${this.db.ctx.publisherId}, ${school}, ${p.relation}) ON CONFLICT DO NOTHING`);
    }
    await this.audit.log('school.import.students', 'school', school, `Imported ${studentCreds.length} student(s), ${parentCreds.length} new parent account(s)`, undefined, summary, school);
    return { ok: true, summary, issues, students: studentCreds.map((c, i) => ({ ...c, className: classes.find((x) => x.id === plan[i].classId) ? `${classes.find((x) => x.id === plan[i].classId)!.name}${classes.find((x) => x.id === plan[i].classId)!.section ? ` — ${classes.find((x) => x.id === plan[i].classId)!.section}` : ''}` : null })), parents: parentCreds };
  }
}

@ApiTags('school admin')
@Controller('school/import')
export class StudentImportController {
  constructor(private readonly svc: StudentImportService) {}
  @Roles('SCHOOL_ADMIN') @Post('students') run(@Body() d: ImportDto, @Query('dryRun') dry?: string) { return this.svc.run(d, dry === '1'); }
}
