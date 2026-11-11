import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Patch, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';
import { diskStorage } from 'multer';
import { Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';
import { ManualTx, Public, Roles } from '../common/decorators';
import { appTmp } from '../common/tmp';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { StorageModule } from '../storage/storage.module';

class BrandingDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(140) tagline?: string;
  @IsOptional() @IsHexColor() primaryColor?: string;
}
const DEFAULTS = { name: 'Knowledge Gate', tagline: 'Books, licences and learning — in one place.', primaryColor: '#4f46e5' };
const LOGO_TYPES: Record<string, { mime: string; magic: (b: Buffer) => boolean }> = {
  png: { mime: 'image/png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { mime: 'image/webp', magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
};

@Injectable()
export class BrandingService {
  constructor(private readonly db: DbService, private readonly assets: AssetsService, private readonly audit: AuditService) {}

  /** Public: the install's publisher (BRANDING_PUBLISHER_SLUG, or the first publisher). */
  async publicBranding(inTx = false) {
    // inTx: right after a change, read it inside the same (not yet committed) transaction
    const { rows } = await (inTx ? this.db.q : this.db.root).execute(sql`SELECT * FROM public_branding(${process.env.BRANDING_PUBLISHER_SLUG ?? ''})`);
    const r = rows[0] as any;
    const b = r?.branding ?? {};
    return {
      name: b.name || DEFAULTS.name, tagline: b.tagline || DEFAULTS.tagline,
      primaryColor: b.primaryColor || DEFAULTS.primaryColor, logoUrl: b.logo ? `/api/branding/logo?v=${b.logo.v}` : null, publisher: r?.name ?? null,
    };
  }
  async logo() {
    const { rows } = await this.db.root.execute(sql`SELECT * FROM public_branding(${process.env.BRANDING_PUBLISHER_SLUG ?? ''})`);
    const l = (rows[0] as any)?.branding?.logo;
    if (!l) throw new NotFoundException();
    return { stream: await this.assets.driver.read(l.key), mime: l.mime };
  }

  private async current() {
    const { rows } = await this.db.q.execute(sql`SELECT coalesce(settings -> 'branding', '{}'::jsonb) AS b FROM publishers WHERE id = ${this.db.ctx.publisherId}`);
    return (rows[0] as any)?.b ?? {};
  }
  private async save(b: any, summary: string, before: any) {
    await this.db.q.execute(sql`SELECT set_branding(${JSON.stringify(b)}::jsonb)`);
    await this.audit.log('branding.update', 'publisher', this.db.ctx.publisherId, summary, before, b);
  }
  async update(d: BrandingDto) {
    const before = await this.current();
    const b = { ...before, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) };
    await this.save(b, 'Updated branding (name, tagline or colour)', before);
    return this.publicBranding(true);
  }
  async setLogo(file: Express.Multer.File) {
    try {
      const buf = fs.readFileSync(file.path);
      const ext = Object.keys(LOGO_TYPES).find((k) => LOGO_TYPES[k].magic(buf));
      if (!ext) throw new BadRequestException('The logo must be a PNG, JPG or WebP image.');
      const sha = createHash('sha256').update(buf).digest('hex');
      const key = `${this.db.ctx.publisherId}/branding/logo-${sha.slice(0, 16)}.${ext}`;
      await this.assets.driver.putFile(key, file.path, LOGO_TYPES[ext].mime);
      const before = await this.current();
      await this.save({ ...before, logo: { key, mime: LOGO_TYPES[ext].mime, v: sha.slice(0, 8) } }, 'Uploaded a new logo', before);
      return this.publicBranding(true);
    } finally { fs.rmSync(file.path, { force: true }); }
  }
  async removeLogo() {
    const before = await this.current();
    const { logo, ...rest } = before;
    await this.save(rest, 'Removed the logo', before);
    return this.publicBranding(true);
  }
}

@ApiTags('branding')
@Controller('branding')
export class BrandingController {
  constructor(private readonly svc: BrandingService, private readonly db: DbService) {}
  @Public() @SkipThrottle() @ManualTx() @Get() get() { return this.svc.publicBranding(); }
  @Public() @SkipThrottle() @ManualTx() @Get('logo')
  async logo(@Res() res: Response) {
    const l = await this.svc.logo();
    res.setHeader('Content-Type', l.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    l.stream.on('error', () => res.destroy()).pipe(res);
  }
  @Roles('PUBLISHER_ADMIN') @Patch() update(@Body() d: BrandingDto) { return this.svc.update(d); }
  @Roles('PUBLISHER_ADMIN') @ManualTx() @Post('logo')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: appTmp('uploads'), filename: (_r: any, _f: any, cb: any) => cb(null, randomBytes(16).toString('hex')) }), limits: { fileSize: 2 * 1048576, files: 1 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('Choose an image');
    return this.db.withContext(req.ctx, () => this.svc.setLogo(file));
  }
  @Roles('PUBLISHER_ADMIN') @Delete('logo') remove() { return this.svc.removeLogo(); }
}

@Module({ imports: [StorageModule], controllers: [BrandingController], providers: [BrandingService] })
export class BrandingModule {}
