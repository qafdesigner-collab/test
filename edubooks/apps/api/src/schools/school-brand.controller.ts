import { BadRequestException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { ManualTx, Roles } from '../common/decorators';
import { appTmp } from '../common/tmp';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { LOGO_TYPES } from '../branding/branding.controller';

/** A school's own name and logo, used on everything printed from a school account. */
@Injectable()
export class SchoolBrandService {
  constructor(private readonly db: DbService, private readonly assets: AssetsService, private readonly audit: AuditService) {}
  private async one(q: ReturnType<typeof sql>) { return ((await this.db.q.execute(q)).rows as any[])[0]; }

  async brand() {
    if (!this.db.ctx.schoolId) return null;
    const s = await this.one(sql`SELECT id, name, code::text AS code, email, phone, address, city, logo_version FROM schools WHERE id = ${this.db.ctx.schoolId}`);
    if (!s) return null;
    return { id: s.id, name: s.name, code: s.code, email: s.email, phone: s.phone, address: s.address, city: s.city, logoUrl: s.logo_version ? `/api/auth/school-logo/${s.id}?v=${s.logo_version}` : null };
  }

  async setLogo(file?: Express.Multer.File) {
    try {
      if (!file) throw new BadRequestException('Choose a picture');
      const buf = Buffer.alloc(16); const fd = await fs.promises.open(file.path, 'r'); await fd.read(buf, 0, 16, 0); await fd.close();
      const ext = Object.keys(LOGO_TYPES).find((k) => LOGO_TYPES[k].magic(buf));
      if (!ext) throw new BadRequestException('Use a PNG, JPG or WebP picture');
      const key = `${this.db.ctx.publisherId}/schools/${this.db.ctx.schoolId}/logo-${randomBytes(6).toString('hex')}.${ext}`;
      await this.assets.driver.putFile(key, file.path, LOGO_TYPES[ext].mime);
      const r = await this.one(sql`SELECT * FROM school_set_logo(${key}, ${LOGO_TYPES[ext].mime})`);
      if (r?.old_key) this.assets.driver.remove(r.old_key).catch(() => undefined);
      await this.audit.log('school.logo.update', 'school', this.db.ctx.schoolId!, 'Uploaded the school logo');
      return this.brand();
    } finally { if (file?.path) fs.promises.rm(file.path, { force: true }).catch(() => undefined); }
  }

  async removeLogo() {
    const r = await this.one(sql`SELECT * FROM school_set_logo(NULL, NULL)`);
    if (r?.old_key) this.assets.driver.remove(r.old_key).catch(() => undefined);
    return this.brand();
  }

  async read(id: string) {
    const s = await this.one(sql`SELECT logo_key, logo_mime FROM schools WHERE id = ${id}`);
    if (!s?.logo_key) throw new NotFoundException('No logo');
    return { stream: await this.assets.driver.read(s.logo_key), mime: s.logo_mime as string };
  }
}

const ANY = ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'];

@ApiTags('school')
@Controller()
export class SchoolBrandController {
  constructor(private readonly svc: SchoolBrandService, private readonly db: DbService) {}
  /** Under /auth so parent accounts (limited to a few areas) can read it for their prints. */
  @Roles(...ANY) @Get('auth/school-brand') brand() { return this.svc.brand(); }
  @Roles('SCHOOL_ADMIN') @ManualTx() @Post('school/logo')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: appTmp('uploads'), filename: (_r: any, _f: any, cb: any) => cb(null, randomBytes(16).toString('hex')) }), limits: { fileSize: 2 * 1048576, files: 1 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Req() req: any) { return this.db.withContext(req.ctx, () => this.svc.setLogo(file)); }
  @Roles('SCHOOL_ADMIN') @Delete('school/logo') remove() { return this.svc.removeLogo(); }
  @SkipThrottle() @Roles(...ANY) @Get('auth/school-logo/:id')
  async logo(@Param('id', new ParseUUIDPipe()) id: string, @Res() res: Response) {
    const l = await this.svc.read(id);
    res.setHeader('Content-Type', l.mime); res.setHeader('Cache-Control', 'private, max-age=604800'); res.setHeader('X-Content-Type-Options', 'nosniff');
    l.stream.on('error', () => res.destroy()).pipe(res);
  }
}

@Module({ controllers: [SchoolBrandController], providers: [SchoolBrandService] })
export class SchoolBrandModule {}
