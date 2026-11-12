import { BadRequestException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';
import { ManualTx, PUBLISHER_STAFF, Roles } from '../common/decorators';
import { appTmp } from '../common/tmp';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { StorageModule } from '../storage/storage.module';
import { LOGO_TYPES } from '../branding/branding.controller';

/** SQL for a package's cover URL (null when no cover image was uploaded). */
export const coverUrlSql = (pkgAlias = 'p') => sql.raw(`CASE WHEN ${pkgAlias}.cover_version IS NOT NULL THEN '/api/covers/' || ${pkgAlias}.id || '?v=' || ${pkgAlias}.cover_version END`);

@Injectable()
export class CoversService {
  constructor(private readonly db: DbService, private readonly assets: AssetsService, private readonly audit: AuditService) {}

  async set(packageId: string, file: Express.Multer.File) {
    try {
      if (!file) throw new BadRequestException('Choose an image');
      const buf = fs.readFileSync(file.path);
      const ext = Object.keys(LOGO_TYPES).find((k) => LOGO_TYPES[k].magic(buf));
      if (!ext) throw new BadRequestException('The cover must be a PNG, JPG or WebP image');
      const { rows: [p] } = await this.db.q.execute(sql`SELECT id, title, cover_key FROM book_packages WHERE id = ${packageId}`) as any;
      if (!p) throw new NotFoundException('Book not found');
      const v = createHash('sha256').update(buf).digest('hex').slice(0, 16);
      const key = `${this.db.ctx.publisherId}/covers/${packageId}-${v}.${ext}`;
      await this.assets.driver.putFile(key, file.path, LOGO_TYPES[ext].mime);
      await this.db.q.execute(sql`UPDATE book_packages SET cover_key = ${key}, cover_mime = ${LOGO_TYPES[ext].mime}, cover_version = ${v}, updated_at = now() WHERE id = ${packageId}`);
      if (p.cover_key && p.cover_key !== key) this.assets.driver.remove(p.cover_key).catch(() => undefined);
      await this.audit.log('publishing.package.cover', 'book_package', packageId, `Uploaded a cover image for ${p.title}`);
      return { coverUrl: `/api/covers/${packageId}?v=${v}` };
    } finally { if (file?.path) fs.promises.rm(file.path, { force: true }).catch(() => undefined); }
  }

  async remove(packageId: string) {
    const { rows: [p] } = await this.db.q.execute(sql`UPDATE book_packages SET cover_key = NULL, cover_mime = NULL, cover_version = NULL WHERE id = ${packageId} RETURNING title`) as any;
    if (!p) throw new NotFoundException('Book not found');
    return { coverUrl: null };
  }

  /** Any signed-in user of the publisher may see covers (they are shop-window images, not book content). */
  async read(packageId: string) {
    const { rows: [p] } = await this.db.q.execute(sql`SELECT cover_key, cover_mime FROM book_packages WHERE id = ${packageId}`) as any;
    if (!p?.cover_key) throw new NotFoundException('No cover');
    return { stream: await this.assets.driver.read(p.cover_key), mime: p.cover_mime };
  }
}

@ApiTags('covers')
@Controller()
export class CoversController {
  constructor(private readonly svc: CoversService, private readonly db: DbService) {}
  @SkipThrottle() @Get('covers/:id')
  async cover(@Param('id', new ParseUUIDPipe()) id: string, @Res() res: Response) {
    const c = await this.svc.read(id);
    res.setHeader('Content-Type', c.mime); res.setHeader('Cache-Control', 'private, max-age=604800'); res.setHeader('X-Content-Type-Options', 'nosniff');
    c.stream.on('error', () => res.destroy()).pipe(res);
  }
  @Roles(...PUBLISHER_STAFF) @ManualTx() @Post('publishing/packages/:id/cover')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: appTmp('uploads'), filename: (_r: any, _f: any, cb: any) => cb(null, randomBytes(16).toString('hex')) }), limits: { fileSize: 5 * 1048576, files: 1 } }))
  upload(@Param('id', new ParseUUIDPipe()) id: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) { return this.db.withContext(req.ctx, () => this.svc.set(id, file)); }
  @Roles(...PUBLISHER_STAFF) @Delete('publishing/packages/:id/cover') remove(@Param('id', new ParseUUIDPipe()) id: string) { return this.svc.remove(id); }
}

@Module({ imports: [StorageModule], controllers: [CoversController], providers: [CoversService] })
export class CoversModule {}
