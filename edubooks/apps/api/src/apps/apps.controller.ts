import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { diskStorage } from 'multer';
import { Response } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';
import { ManualTx, PUBLISHER_STAFF, Public, Roles } from '../common/decorators';
import { appTmp } from '../common/tmp';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { StorageModule } from '../storage/storage.module';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';

const HTTPS = /^https:\/\/\S+$/;
class AppDto {
  @IsOptional() @ValidateIf((o) => !!o.androidUrl) @Matches(HTTPS, { message: 'Links must start with https://' }) @MaxLength(500) androidUrl?: string;
  @IsOptional() @ValidateIf((o) => !!o.iosUrl) @Matches(HTTPS, { message: 'Links must start with https://' }) @MaxLength(500) iosUrl?: string;
  @IsOptional() @IsString() @MaxLength(40) version?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
const APK_MIME = 'application/vnd.android.package-archive';
const LINK_DAYS = 7;

/**
 * The "Mobile App" part of a book: an Android .apk and/or store links. Pupils get a QR code; the app is the
 * only thing a pupil can download — everything else is view-only inside the platform.
 */
@Injectable()
export class AppsService {
  constructor(private readonly db: DbService, private readonly assets: AssetsService, private readonly audit: AuditService, private readonly access: AccessService) {}
  private async rows(s: ReturnType<typeof sql>) { return (await this.db.q.execute(s)).rows as any[]; }
  private sign(p: string) { return createHmac('sha256', config.fileUrlSecret).update(`app:${p}`).digest('base64url'); }

  private async component(id: string, staffOnly = false) {
    const [c] = await this.rows(sql`SELECT id, edition_id, type, title FROM book_components WHERE id = ${id}`);
    if (!c) throw new NotFoundException('Book part not found');
    if (c.type !== 'MOBILE_APP') throw new BadRequestException('This book part is not a mobile app');
    if (!staffOnly) await this.access.assertEdition(c.edition_id);
    return c;
  }
  private async get(componentId: string) {
    const [a] = await this.rows(sql`SELECT b.android_url AS "androidUrl", b.ios_url AS "iosUrl", b.version, b.notes, b.asset_id AS "assetId", d.original_name AS "apkName", d.size_bytes AS "apkSize"
      FROM book_apps b LEFT JOIN digital_assets d ON d.id = b.asset_id WHERE b.component_id = ${componentId}`);
    return a ?? { androidUrl: null, iosUrl: null, version: '', notes: '', assetId: null, apkName: null, apkSize: null };
  }

  async adminGet(componentId: string) { await this.component(componentId, true); return this.get(componentId); }
  async save(componentId: string, d: AppDto) {
    await this.component(componentId, true);
    await this.db.q.execute(sql`INSERT INTO book_apps (component_id, publisher_id, android_url, ios_url, version, notes) VALUES (${componentId}, ${this.db.ctx.publisherId}, ${d.androidUrl || null}, ${d.iosUrl || null}, ${d.version ?? ''}, ${d.notes ?? ''})
      ON CONFLICT (component_id) DO UPDATE SET android_url = excluded.android_url, ios_url = excluded.ios_url, version = excluded.version, notes = excluded.notes, updated_at = now()`);
    return this.get(componentId);
  }
  async uploadApk(componentId: string, file: Express.Multer.File) {
    try {
      const c = await this.component(componentId, true);
      if (!file) throw new BadRequestException('Choose the .apk file');
      const head = Buffer.alloc(4); const fd = fs.openSync(file.path, 'r'); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
      if (!/\.apk$/i.test(file.originalname) || !head.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new BadRequestException('Upload an Android app file (.apk)');
      const sha = await new Promise<string>((res, rej) => { const h = createHash('sha256'); fs.createReadStream(file.path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
      const P = this.db.ctx.publisherId;
      let [asset] = await this.rows(sql`SELECT id FROM digital_assets WHERE publisher_id = ${P} AND sha256 = ${sha}`);
      if (!asset) {
        const key = `${P}/${sha.slice(0, 2)}/${sha}.apk`;
        await this.assets.driver.putFile(key, file.path, APK_MIME);
        [asset] = await this.rows(sql`INSERT INTO digital_assets (publisher_id, sha256, storage_key, original_name, mime_type, ext, size_bytes, scan_status, uploaded_by)
          VALUES (${P}, ${sha}, ${key}, ${file.originalname.slice(0, 250)}, ${APK_MIME}, 'apk', ${file.size}, 'SKIPPED', ${this.db.ctx.userId}) RETURNING id`);
      }
      await this.db.q.execute(sql`INSERT INTO book_apps (component_id, publisher_id, asset_id) VALUES (${componentId}, ${P}, ${asset.id})
        ON CONFLICT (component_id) DO UPDATE SET asset_id = excluded.asset_id, updated_at = now()`);
      await this.audit.log('publishing.app.upload', 'book_component', componentId, `Uploaded the Android app for “${c.title}”`);
      return this.get(componentId);
    } finally { if (file?.path) fs.promises.rm(file.path, { force: true }).catch(() => undefined); }
  }
  async removeApk(componentId: string) {
    await this.component(componentId, true);
    await this.db.q.execute(sql`UPDATE book_apps SET asset_id = NULL, updated_at = now() WHERE component_id = ${componentId}`);
    return this.get(componentId);
  }

  /** For readers with a licence: store links and a 7-day download link (for the QR code) to the .apk. */
  async forReader(componentId: string) {
    await this.component(componentId);
    const a = await this.get(componentId);
    let apkUrl: string | null = null;
    if (a.assetId) {
      const payload = Buffer.from(JSON.stringify({ c: componentId, a: a.assetId, p: this.db.ctx.publisherId, e: Math.floor(Date.now() / 1000) + LINK_DAYS * 86400 })).toString('base64url');
      apkUrl = `/api/app-download/${payload}.${this.sign(payload)}`;
    }
    return { androidUrl: a.androidUrl, iosUrl: a.iosUrl, version: a.version, notes: a.notes, apkUrl, apkName: a.apkName, apkSize: a.apkSize };
  }

  async download(token: string) {
    const [payload, sig] = token.split('.');
    const ok = payload && sig && (() => { const a = Buffer.from(this.sign(payload)); const b = Buffer.from(sig); return a.length === b.length && timingSafeEqual(a, b); })();
    if (!ok) throw new ForbiddenException('Invalid link');
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (d.e < Date.now() / 1000) throw new ForbiddenException('This download link has expired. Open the book again for a new QR code.');
    const a = await this.db.withContext({ userId: '', publisherId: d.p, schoolId: null, roles: [], staff: false }, async () =>
      ((await this.db.q.execute(sql`SELECT storage_key, original_name FROM digital_assets WHERE id = ${d.a} AND publisher_id = ${d.p} AND ext = 'apk'`)).rows[0] as any));
    if (!a) throw new NotFoundException('App not found');
    return { stream: await this.assets.driver.read(a.storage_key), name: a.original_name as string };
  }
}

@ApiTags('apps')
@Controller()
export class AppsController {
  constructor(private readonly svc: AppsService, private readonly db: DbService) {}
  @Roles(...PUBLISHER_STAFF) @Get('publishing/components/:id/app') adminGet(@Param('id', new ParseUUIDPipe()) id: string) { return this.svc.adminGet(id); }
  @Roles(...PUBLISHER_STAFF) @Put('publishing/components/:id/app') save(@Param('id', new ParseUUIDPipe()) id: string, @Body() d: AppDto) { return this.svc.save(id, d); }
  @Roles(...PUBLISHER_STAFF) @ManualTx() @Post('publishing/components/:id/app/apk')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: appTmp('uploads'), filename: (_r: any, _f: any, cb: any) => cb(null, randomBytes(16).toString('hex')) }), limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 100) * 1048576, files: 1 } }))
  upload(@Param('id', new ParseUUIDPipe()) id: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) { return this.db.withContext(req.ctx, () => this.svc.uploadApk(id, file)); }
  @Roles(...PUBLISHER_STAFF) @Delete('publishing/components/:id/app/apk') removeApk(@Param('id', new ParseUUIDPipe()) id: string) { return this.svc.removeApk(id); }
  @Roles('SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PUBLISHER_ADMIN', 'PUBLISHER_EDITOR') @Get('reader/components/:id/app') reader(@Param('id', new ParseUUIDPipe()) id: string) { return this.svc.forReader(id); }
  /** Opened from the QR code on a phone (usually not signed in), so the link itself is the permission. */
  @Public() @ManualTx() @Get('app-download/:token')
  async download(@Param('token') token: string, @Res() res: Response) {
    const f = await this.svc.download(token);
    res.setHeader('Content-Type', APK_MIME);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name.replace(/[^\w.-]+/g, '_'))}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    f.stream.on('error', () => res.destroy()).pipe(res);
  }
}

@Module({ imports: [StorageModule, LmsModule], controllers: [AppsController], providers: [AppsService] })
export class AppsModule {}
