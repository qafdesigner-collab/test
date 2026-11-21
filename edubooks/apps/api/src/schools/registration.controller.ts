import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { randomInt } from 'crypto';
import { sql } from 'drizzle-orm';
import { DbService, TenantCtx } from '../db/db.service';
import { ManualTx, Public, Roles } from '../common/decorators';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SchoolsService } from './schools.service';

class RegSchool {
  @IsString() @Length(2, 160) name!: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @IsOptional() @IsUUID() curriculumId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) students?: number;
}
class RegAdmin {
  @IsString() @Length(2, 120) name!: string;
  @IsEmail() @MaxLength(160) email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @Matches(/^[a-z0-9._-]{3,40}$/, { message: 'Login ID: 3–40 lowercase letters, digits, dot, dash or underscore' }) username!: string;
  @IsString() @Length(8, 200) password!: string;
}
class RegisterDto {
  @ValidateNested() @Type(() => RegSchool) school!: RegSchool;
  @ValidateNested() @Type(() => RegAdmin) admin!: RegAdmin;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  /** Hidden field: people leave it empty, spam robots fill it in. */
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}
class DecideDto { @IsOptional() @IsString() @MaxLength(500) note?: string; }
class RegSettingsDto { @IsBoolean() enabled!: boolean; }

/**
 * "Register your school" on the login page. A new school and its admin are created but wait (school suspended)
 * until the publisher approves; the publisher's admins are notified. The publisher can switch the page off.
 */
@ApiTags('schools')
@Controller()
export class RegistrationController {
  constructor(private readonly db: DbService, private readonly schools: SchoolsService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  private async info() {
    const { rows: [r] } = await this.db.root.execute(sql`SELECT * FROM public_registration_info()`) as any;
    if (!r) throw new NotFoundException('Registration is not available');
    return r as { publisher_id: string; enabled: boolean };
  }
  private asPublisher<T>(publisherId: string, ip: string | undefined, fn: () => Promise<T>) {
    const ctx = { userId: null as unknown as string, publisherId, schoolId: null, roles: ['PUBLISHER_ADMIN'], staff: true, ip } as TenantCtx;
    return this.db.withContext(ctx, fn);
  }

  @Public() @ManualTx() @Get('public/school-registration')
  async form() {
    const r = await this.info();
    if (!r.enabled) return { enabled: false, curricula: [] };
    const curricula = await this.asPublisher(r.publisher_id, undefined, async () => (await this.db.q.execute(sql`SELECT id, name FROM curricula ORDER BY name`)).rows);
    return { enabled: true, curricula };
  }

  @Public() @ManualTx() @Throttle({ default: { limit: 5, ttl: 3600_000 } }) @Post('public/school-registration')
  async register(@Body() d: RegisterDto, @Req() req: any) {
    const r = await this.info();
    if (!r.enabled) throw new ForbiddenException('School registration is closed. Please contact the publisher.');
    if (d.website) return { ok: true, code: 'PENDING', username: d.admin.username }; // robot: pretend it worked, store nothing
    const ip = req.ip;
    return this.asPublisher(r.publisher_id, ip, async () => {
      // a short school code from the name, e.g. "Sunrise Grammar School" → SGS + 2 digits
      const letters = d.school.name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 4) || 'SCH';
      let code = '';
      for (let i = 0; i < 30 && !code; i++) {
        const c = `${letters.padEnd(3, 'X')}${randomInt(10, i < 15 ? 100 : 1000)}`;
        const { rows } = await this.db.q.execute(sql`SELECT 1 FROM schools WHERE code = ${c}`); if (!rows.length) code = c;
      }
      if (!code) throw new BadRequestException('Please try again');
      const s = await this.schools.create({ name: d.school.name, code, city: d.school.city, phone: d.school.phone, address: d.school.address, curriculumId: d.school.curriculumId,
        adminName: d.admin.name, adminUsername: d.admin.username, adminPassword: d.admin.password });
      await this.db.q.execute(sql`UPDATE schools SET status = 'SUSPENDED', email = ${d.school.email ?? null} WHERE id = ${s.id}`);
      await this.db.q.execute(sql`UPDATE users SET email = ${d.admin.email}, phone = ${d.admin.phone ?? null} WHERE school_id = ${s.id} AND username = ${d.admin.username}`);
      await this.db.q.execute(sql`INSERT INTO school_registrations (school_id, publisher_id, contact_name, contact_email, contact_phone, school_email, students, message, ip)
        VALUES (${s.id}, ${r.publisher_id}, ${d.admin.name}, ${d.admin.email}, ${d.admin.phone ?? ''}, ${d.school.email ?? ''}, ${d.school.students ?? null}, ${(d.message ?? '').trim()}, ${ip ?? null})`);
      await this.audit.log('school.register', 'school', s.id, `New school registration: ${s.name} (${code}) by ${d.admin.name}`, undefined, undefined, s.id);
      const { rows: admins } = await this.db.q.execute(sql`SELECT u.id, u.phone FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'PUBLISHER_ADMIN' WHERE u.school_id IS NULL AND u.status = 'ACTIVE'`);
      await this.notifications.notify(admins as any[], { kind: 'SCHOOL_REGISTRATION', title: `New school registration: ${s.name}`, body: `${d.school.city ? `${d.school.city} · ` : ''}${d.admin.name} (${d.admin.email}) — waiting for your approval.`, link: '/admin/schools?pending=1' }, { email: true }).catch(() => undefined);
      return { ok: true, code, username: d.admin.username };
    });
  }

  // ---------- publisher ----------
  @Roles('PUBLISHER_ADMIN', 'PUBLISHER_SALES') @Get('schools/registrations')
  async list(@Query('status') status?: string) {
    const st = ['PENDING', 'APPROVED', 'REJECTED'].includes(String(status)) ? status : null;
    const { rows } = await this.db.q.execute(sql`SELECT r.*, s.name, s.code, s.city, s.address, s.phone, s.status AS "schoolStatus" FROM school_registrations r JOIN schools s ON s.id = r.school_id
      WHERE ${st ? sql`r.status = ${st}` : sql`true`} ORDER BY r.created_at DESC LIMIT 200`);
    const { rows: [set] } = await this.db.q.execute(sql`SELECT enabled FROM public_registration_info()`) as any;
    return { enabled: !!set?.enabled, items: rows };
  }
  @Roles('PUBLISHER_ADMIN') @Post('schools/:id/registration/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @Body() d: DecideDto) { return this.decide(id, 'APPROVED', d.note); }
  @Roles('PUBLISHER_ADMIN') @Post('schools/:id/registration/reject')
  async reject(@Param('id', ParseUUIDPipe) id: string, @Body() d: DecideDto) { return this.decide(id, 'REJECTED', d.note); }
  private async decide(id: string, status: 'APPROVED' | 'REJECTED', note = '') {
    const { rows: [r] } = await this.db.q.execute(sql`SELECT r.*, s.name FROM school_registrations r JOIN schools s ON s.id = r.school_id WHERE r.school_id = ${id}`) as any;
    if (!r) throw new NotFoundException('Registration not found');
    await this.db.q.execute(sql`UPDATE school_registrations SET status = ${status}, decided_by = ${this.db.ctx.userId}, decided_at = now(), decision_note = ${note.trim()} WHERE school_id = ${id}`);
    await this.schools.setStatus(id, status === 'APPROVED' ? 'ACTIVE' : 'SUSPENDED', status === 'REJECTED' ? note || 'Registration not approved' : undefined);
    await this.audit.log(`school.registration.${status.toLowerCase()}`, 'school', id, `${status === 'APPROVED' ? 'Approved' : 'Rejected'} the registration of ${r.name}${note ? ` — ${note}` : ''}`, undefined, undefined, id);
    return { ok: true, status };
  }
  @Roles('PUBLISHER_ADMIN') @Put('schools/registration-settings')
  async settings(@Body() d: RegSettingsDto) {
    await this.db.q.execute(sql`SELECT set_school_self_registration(${d.enabled})`);
    await this.audit.log('school.registration.settings', 'publisher', this.db.ctx.publisherId, `School self-registration ${d.enabled ? 'opened' : 'closed'}`);
    return { enabled: d.enabled };
  }
}
