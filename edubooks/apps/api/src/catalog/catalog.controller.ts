import { BadRequestException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsHexColor, IsInt, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { asc, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { qc } from '../db/qualify';
import { bookPackages, curricula, grades, schools, subjects } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { PUBLISHER_STAFF, Roles } from '../common/decorators';

class NamedDto {
  @IsString() @Length(1, 60) name: string;
  @IsOptional() @IsInt() @Min(0) sort?: number;
}
export class GradeDto extends NamedDto {
  /** Defaults to the "Other" curriculum. */
  @IsOptional() @IsUUID() curriculumId?: string;
  @IsOptional() @IsString() @MaxLength(80) stage?: string;
}
export class SubjectDto extends NamedDto {
  @IsOptional() @IsHexColor() color?: string;
}
export class CurriculumDto {
  @IsString() @Length(2, 80) name: string;
  @Matches(/^[A-Za-z0-9_-]{2,20}$/, { message: 'Code: 2–20 letters, digits, dash or underscore' }) code: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsInt() @Min(0) sort?: number;
}
class UpdateCurriculumDto extends PartialType(CurriculumDto) {}
class UpdateGradeDto extends PartialType(GradeDto) {}
class UpdateSubjectDto extends PartialType(SubjectDto) {}

@Injectable()
export class CatalogService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}
  private table(kind: 'grade' | 'subject') { return kind === 'grade' ? grades : subjects; }

  async list(kind: 'grade' | 'subject', curriculumId?: string) {
    if (kind === 'grade') {
      return this.db.q.select({ id: grades.id, name: grades.name, sort: grades.sort, stage: grades.stage, curriculumId: grades.curriculumId,
        curriculumCode: curricula.code, curriculumName: curricula.name,
        packageCount: sql<number>`(SELECT count(*)::int FROM ${bookPackages} WHERE ${bookPackages.gradeId} = ${qc(grades.id)})` })
        .from(grades).innerJoin(curricula, eq(curricula.id, grades.curriculumId))
        .where(curriculumId ? eq(grades.curriculumId, curriculumId) : undefined)
        .orderBy(asc(curricula.sort), asc(grades.sort), asc(grades.name));
    }
    return this.db.q.select({ id: subjects.id, name: subjects.name, sort: subjects.sort, color: subjects.color,
      packageCount: sql<number>`(SELECT count(*)::int FROM ${bookPackages} WHERE ${bookPackages.subjectId} = ${qc(subjects.id)})` })
      .from(subjects).orderBy(asc(subjects.sort), asc(subjects.name));
  }

  // ---- curricula
  curricula() {
    return this.db.q.select({ id: curricula.id, code: curricula.code, name: curricula.name, description: curricula.description, color: curricula.color, sort: curricula.sort,
      gradeCount: sql<number>`(SELECT count(*)::int FROM grades g WHERE g.curriculum_id = ${qc(curricula.id)})`,
      schoolCount: sql<number>`(SELECT count(*)::int FROM schools s WHERE s.curriculum_id = ${qc(curricula.id)})`,
      packageCount: sql<number>`(SELECT count(*)::int FROM book_packages p JOIN grades g ON g.id = p.grade_id WHERE g.curriculum_id = ${qc(curricula.id)})` })
      .from(curricula).orderBy(asc(curricula.sort), asc(curricula.name));
  }
  async createCurriculum(d: CurriculumDto) {
    const [row] = await this.db.q.insert(curricula).values({ publisherId: this.db.ctx.publisherId, ...d, code: d.code.toUpperCase() } as any).returning();
    await this.audit.log('catalog.curriculum.create', 'curriculum', row.id, `Created curriculum "${row.name}"`, undefined, row);
    return row;
  }
  async updateCurriculum(id: string, d: Partial<CurriculumDto>) {
    const [before] = await this.db.q.select().from(curricula).where(eq(curricula.id, id));
    if (!before) throw new NotFoundException();
    const [row] = await this.db.q.update(curricula).set({ ...d, ...(d.code ? { code: d.code.toUpperCase() } : {}) } as any).where(eq(curricula.id, id)).returning();
    await this.audit.log('catalog.curriculum.update', 'curriculum', id, `Updated curriculum "${row.name}"`, before, row);
    return row;
  }
  async removeCurriculum(id: string) {
    const [c] = await this.db.q.select().from(curricula).where(eq(curricula.id, id));
    if (!c) throw new NotFoundException();
    if (String(c.code).toUpperCase() === 'OTHER') throw new BadRequestException('"Other" is needed for grades without a curriculum and cannot be deleted.');
    const [{ n }] = (await this.db.q.execute(sql`SELECT count(*)::int AS n FROM grades WHERE curriculum_id = ${id}`)).rows as any[];
    if (n) throw new BadRequestException(`Delete or move its ${n} grade(s) first.`);
    await this.db.q.update(schools).set({ curriculumId: null }).where(eq(schools.curriculumId, id));
    await this.db.q.delete(curricula).where(eq(curricula.id, id));
    await this.audit.log('catalog.curriculum.delete', 'curriculum', id, `Deleted curriculum "${c.name}"`, c);
    return { ok: true };
  }
  private async checkCurriculum(id?: string | null) {
    if (!id) return;
    const [c] = await this.db.q.select({ id: curricula.id }).from(curricula).where(eq(curricula.id, id));
    if (!c) throw new BadRequestException('Unknown curriculum');
  }
  async create(kind: 'grade' | 'subject', dto: SubjectDto | GradeDto) {
    if (kind === 'grade') await this.checkCurriculum((dto as GradeDto).curriculumId);
    const t = this.table(kind);
    const [row] = await this.db.q.insert(t).values({ publisherId: this.db.ctx.publisherId, ...dto } as any).returning();
    await this.audit.log(`catalog.${kind}.create`, kind, row.id, `Created ${kind} "${row.name}"`, undefined, row);
    return row;
  }
  async update(kind: 'grade' | 'subject', id: string, dto: Partial<SubjectDto & GradeDto>) {
    if (kind === 'grade') await this.checkCurriculum(dto.curriculumId);
    const t = this.table(kind);
    const [before] = await this.db.q.select().from(t).where(eq(t.id, id));
    if (!before) throw new NotFoundException();
    const [row] = await this.db.q.update(t).set(dto as any).where(eq(t.id, id)).returning();
    await this.audit.log(`catalog.${kind}.update`, kind, id, `Updated ${kind} "${row.name}"`, before, row);
    return row;
  }
  async remove(kind: 'grade' | 'subject', id: string) {
    const t = this.table(kind);
    const [row] = await this.db.q.delete(t).where(eq(t.id, id)).returning(); // FK RESTRICT blocks if used by packages
    if (!row) throw new NotFoundException();
    await this.audit.log(`catalog.${kind}.delete`, kind, id, `Deleted ${kind} "${row.name}"`, row);
    return { ok: true };
  }
}

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}
  @Get('curricula') curricula() { return this.svc.curricula(); }
  @Roles(...PUBLISHER_STAFF) @Post('curricula') addCurriculum(@Body() d: CurriculumDto) { return this.svc.createCurriculum(d); }
  @Roles(...PUBLISHER_STAFF) @Patch('curricula/:id') updCurriculum(@Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateCurriculumDto) { return this.svc.updateCurriculum(id, d); }
  @Roles(...PUBLISHER_STAFF) @Delete('curricula/:id') delCurriculum(@Param('id', ParseUUIDPipe) id: string) { return this.svc.removeCurriculum(id); }
  @Get('grades') grades(@Query('curriculumId', new ParseUUIDPipe({ optional: true })) curriculumId?: string) { return this.svc.list('grade', curriculumId); }
  @Roles(...PUBLISHER_STAFF) @Post('grades') addGrade(@Body() d: GradeDto) { return this.svc.create('grade', d); }
  @Roles(...PUBLISHER_STAFF) @Patch('grades/:id') updGrade(@Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateGradeDto) { return this.svc.update('grade', id, d); }
  @Roles(...PUBLISHER_STAFF) @Delete('grades/:id') delGrade(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove('grade', id); }
  @Get('subjects') subjects() { return this.svc.list('subject'); }
  @Roles(...PUBLISHER_STAFF) @Post('subjects') addSubject(@Body() d: SubjectDto) { return this.svc.create('subject', d); }
  @Roles(...PUBLISHER_STAFF) @Patch('subjects/:id') updSubject(@Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateSubjectDto) { return this.svc.update('subject', id, d); }
  @Roles(...PUBLISHER_STAFF) @Delete('subjects/:id') delSubject(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove('subject', id); }
}
