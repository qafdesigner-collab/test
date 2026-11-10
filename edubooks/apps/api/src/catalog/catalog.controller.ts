import { Body, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsHexColor, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { asc, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { bookPackages, grades, subjects } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { PUBLISHER_STAFF, Roles } from '../common/decorators';

export class GradeDto {
  @IsString() @Length(1, 60) name: string;
  @IsOptional() @IsInt() @Min(0) sort?: number;
}
export class SubjectDto extends GradeDto {
  @IsOptional() @IsHexColor() color?: string;
}
class UpdateGradeDto extends PartialType(GradeDto) {}
class UpdateSubjectDto extends PartialType(SubjectDto) {}

@Injectable()
export class CatalogService {
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}
  private table(kind: 'grade' | 'subject') { return kind === 'grade' ? grades : subjects; }

  async list(kind: 'grade' | 'subject') {
    const t = this.table(kind);
    const col = kind === 'grade' ? bookPackages.gradeId : bookPackages.subjectId;
    return this.db.q.select({ id: t.id, name: t.name, sort: t.sort, ...(kind === 'subject' ? { color: subjects.color } : {}),
      packageCount: sql<number>`(SELECT count(*)::int FROM ${bookPackages} WHERE ${col} = ${t.id})` })
      .from(t).orderBy(asc(t.sort), asc(t.name));
  }
  async create(kind: 'grade' | 'subject', dto: SubjectDto) {
    const t = this.table(kind);
    const [row] = await this.db.q.insert(t).values({ publisherId: this.db.ctx.publisherId, ...dto } as any).returning();
    await this.audit.log(`catalog.${kind}.create`, kind, row.id, `Created ${kind} "${row.name}"`, undefined, row);
    return row;
  }
  async update(kind: 'grade' | 'subject', id: string, dto: Partial<SubjectDto>) {
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
  @Get('grades') grades() { return this.svc.list('grade'); }
  @Roles(...PUBLISHER_STAFF) @Post('grades') addGrade(@Body() d: GradeDto) { return this.svc.create('grade', d); }
  @Roles(...PUBLISHER_STAFF) @Patch('grades/:id') updGrade(@Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateGradeDto) { return this.svc.update('grade', id, d); }
  @Roles(...PUBLISHER_STAFF) @Delete('grades/:id') delGrade(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove('grade', id); }
  @Get('subjects') subjects() { return this.svc.list('subject'); }
  @Roles(...PUBLISHER_STAFF) @Post('subjects') addSubject(@Body() d: SubjectDto) { return this.svc.create('subject', d); }
  @Roles(...PUBLISHER_STAFF) @Patch('subjects/:id') updSubject(@Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateSubjectDto) { return this.svc.update('subject', id, d); }
  @Roles(...PUBLISHER_STAFF) @Delete('subjects/:id') delSubject(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove('subject', id); }
}
