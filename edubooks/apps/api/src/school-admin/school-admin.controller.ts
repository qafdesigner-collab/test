import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';
import { eq, desc, sql } from 'drizzle-orm';
import { Ctx, Roles } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import { DbService, TenantCtx } from '../db/db.service';
import { academicYears, schools } from '../db/schema';
import { LicensingService } from '../licensing/licensing.service';
import { SchoolUsersService } from '../schools/school-users.service';
import { AuditService } from '../audit/audit.service';

class UserQuery extends PageQuery {
  @IsOptional() @IsIn(['SCHOOL_ADMIN', 'TEACHER', 'STUDENT']) role?: 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT';
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
class NewUserDto {
  @IsString() @Length(1, 120) displayName: string;
  @IsOptional() @IsString() @MaxLength(40) username?: string;
  @IsOptional() @IsString() @Length(6, 200) password?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(80) designation?: string;
}
class CreateUsersDto {
  @IsIn(['TEACHER', 'STUDENT']) role: 'TEACHER' | 'STUDENT';
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => NewUserDto) users: NewUserDto[];
}
class ImportDto {
  @IsIn(['TEACHER', 'STUDENT']) role: 'TEACHER' | 'STUDENT';
  @IsString() @Length(1, 500_000) csv: string;
}
class UpdateUserDto {
  @IsOptional() @IsString() @Length(1, 120) displayName?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(80) designation?: string;
}
class LoginsQuery { @IsIn(['STUDENT', 'TEACHER', 'SCHOOL_ADMIN', 'PARENT']) role!: 'STUDENT' | 'TEACHER' | 'SCHOOL_ADMIN' | 'PARENT'; @IsOptional() @IsUUID() classId?: string; }
export class ResetLoginsDto { @IsIn(['STUDENT', 'TEACHER']) role!: 'STUDENT' | 'TEACHER'; @IsOptional() @IsUUID() classId?: string; @IsOptional() @IsArray() @ArrayMaxSize(600) @IsUUID('all', { each: true }) userIds?: string[]; }
class AssignDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @IsUUID('all', { each: true }) userIds: string[]; }
class TransferDto { @IsUUID() assignmentId: string; @IsUUID() toUserId: string; @IsString() @Length(3, 500) reason: string; }
class ReasonDto { @IsOptional() @IsString() @MaxLength(500) reason?: string; }
class ProfileDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
}
const Id = () => new ParseUUIDPipe();

class EraseDto { @IsString() @MaxLength(60) confirmUsername: string }

/** School Admin portal API. Every call is scoped to the admin's own school (and RLS enforces it again). */
@ApiTags('school admin')
@Roles('SCHOOL_ADMIN')
@Controller('school')
export class SchoolAdminController {
  constructor(private readonly db: DbService, private readonly users: SchoolUsersService, private readonly licensing: LicensingService, private readonly audit: AuditService) {}
  /** Right to erasure: removes the child's personal data and learning records; frees their book seats. */
  @Post('students/:id/erase') erase(@Ctx() c: TenantCtx, @Param('id', Id()) id: string, @Body() d: EraseDto) { return this.licensing.eraseStudent(this.sid(c), id, d.confirmUsername); }
  private sid(c: TenantCtx) { return c.schoolId!; }

  @Get('overview')
  async overview(@Ctx() c: TenantCtx) {
    const [school] = await this.db.q.select().from(schools).where(eq(schools.id, this.sid(c)));
    const years = await this.db.q.select().from(academicYears).where(eq(academicYears.schoolId, this.sid(c))).orderBy(desc(academicYears.startsOn));
    // Sequential: all queries share the request's single transaction connection.
    const t = await this.users.list(this.sid(c), { role: 'TEACHER', page: 1, pageSize: 1 });
    const s = await this.users.list(this.sid(c), { role: 'STUDENT', page: 1, pageSize: 1 });
    return { school, academicYears: years, teachers: t.total, students: s.total, licences: await this.licensing.dashboard(this.sid(c)) };
  }
  @Patch('profile')
  async profile(@Ctx() c: TenantCtx, @Body() d: ProfileDto) {
    // Name and contact details; the school code and status stay with the publisher (narrow SECURITY DEFINER function).
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) throw new BadRequestException('Enter a valid email address');
    await this.db.q.execute(sql`SELECT school_update_details(${d.name ?? null}, ${d.email ?? null}, ${d.city ?? null}, ${d.phone ?? null}, ${d.address ?? null})`);
    await this.audit.log('school.profile.update', 'school', this.sid(c), 'Updated school details', undefined, d);
    return { ok: true };
  }

  @Get('users') list(@Ctx() c: TenantCtx, @Query() q: UserQuery) { return this.users.list(this.sid(c), q); }
  @Post('users') create(@Ctx() c: TenantCtx, @Body() d: CreateUsersDto) { return this.users.create(this.sid(c), d.role, d.users); }
  @Post('users/import') import(@Ctx() c: TenantCtx, @Body() d: ImportDto) { return this.users.create(this.sid(c), d.role, this.users.parseCsv(d.csv)); }
  @Patch('users/:id') update(@Ctx() c: TenantCtx, @Param('id', Id()) id: string, @Body() d: UpdateUserDto) { return this.users.update(this.sid(c), id, d); }
  @Get('logins') logins(@Ctx() c: TenantCtx, @Query() q: LoginsQuery) { return this.users.loginList(this.sid(c), q.role, q.classId); }
  @Post('logins/reset') resetLogins(@Ctx() c: TenantCtx, @Body() d: ResetLoginsDto) { return this.users.resetMany(this.sid(c), d.role, d); }
    @Post('users/:id/reset-password') reset(@Ctx() c: TenantCtx, @Param('id', Id()) id: string) { return this.users.resetPassword(this.sid(c), id); }

  @Get('pools') pools(@Ctx() c: TenantCtx) { return this.licensing.listPools({ schoolId: this.sid(c) }); }
  @Get('pools/:id') pool(@Param('id', Id()) id: string) { return this.licensing.getPool(id); }
  @Get('pools/:id/eligible') eligible(@Param('id', Id()) id: string) { return this.licensing.eligibleUsers(id); }
  @Post('pools/:id/assign') assign(@Param('id', Id()) id: string, @Body() d: AssignDto) { return this.licensing.assign(id, d.userIds); }
  @Post('assignments/:id/release') release(@Param('id', Id()) id: string, @Body() d: ReasonDto) { return this.licensing.release(id, d.reason ?? ''); }

  @Get('transfers') transfers(@Ctx() c: TenantCtx) { return this.licensing.listTransfers({ schoolId: this.sid(c) }); }
  @Post('transfers') requestTransfer(@Body() d: TransferDto) { return this.licensing.requestTransfer(d.assignmentId, d.toUserId, d.reason); }
  @Post('transfers/:id/cancel') cancel(@Param('id', Id()) id: string) { return this.licensing.decideTransfer(id, 'CANCELLED'); }
}
