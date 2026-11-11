import { BadRequestException, Body, Controller, ForbiddenException, Get, Logger, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { diskStorage } from 'multer';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { ManualTx, Roles } from '../common/decorators';
import { DbService } from '../db/db.service';
import { users } from '../db/schema';
import { verifyPassword } from '../auth/password';
import { AuditService } from '../audit/audit.service';

export class ConfirmDto { @IsString() @MaxLength(200) password!: string }
export class UrlDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Enter a link that starts with https://' }) @MaxLength(2000) url!: string;
  @IsOptional() @IsString() @MaxLength(200) password?: string;
}

const MAX_PACKAGE = 1024 * 1024 * 1024; // 1 GB
const root = () => process.env.EDUBOOKS_APP_ROOT || '';
const incoming = () => { const d = path.join(root() || os.tmpdir(), 'updates', 'incoming'); fs.mkdirSync(d, { recursive: true }); return d; };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const updater = () => require(path.join(root(), 'updater.js'));
const logFn = (l: Logger) => (level: string, msg: string) => (level === 'error' ? l.error(msg) : l.log(msg));

/**
 * Super admin → Updates. Works on single-folder installs (cPanel package), where the program can replace itself.
 * Docker installs are updated by deploying new images instead.
 */
@ApiTags('system')
@Roles('PUBLISHER_ADMIN')
@Controller('system/updates')
export class SystemController {
  private readonly log = new Logger('Updates');
  constructor(private readonly db: DbService, private readonly audit: AuditService) {}

  private supported() { if (!root() || !fs.existsSync(path.join(root(), 'updater.js'))) throw new ForbiddenException('Updates from the admin panel are available on cPanel installations. This server is updated by deploying a new version.'); }

  private async checkPassword(password: string) {
    const [u] = await this.db.q.select({ hash: users.passwordHash }).from(users).where(eq(users.id, this.db.ctx.userId!));
    if (!u || !(await verifyPassword(u.hash, password))) throw new BadRequestException('Your password is not correct.');
  }

  @Get()
  status() {
    if (!root() || !fs.existsSync(path.join(root(), 'updater.js'))) return { supported: false };
    return { supported: true, ...updater().status() };
  }

  /** Upload a package: it is unpacked and checked, nothing is changed yet. */
  @ManualTx()
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('package', {
    storage: diskStorage({ destination: (_r: any, _f: any, cb: any) => cb(null, incoming()), filename: (_r: any, _f: any, cb: any) => cb(null, `${randomBytes(12).toString('hex')}.zip`) }),
    limits: { fileSize: MAX_PACKAGE, files: 1 },
  }))
  async upload(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    this.supported();
    if (!file) throw new BadRequestException('Choose the update file (.zip)');
    try { return await updater().stage(file.path); }
    catch (e: any) { throw new BadRequestException(e.message); }
    finally { fs.rmSync(file.path, { force: true }); await this.db.withContext(req.ctx, () => this.audit.log('system.update.upload', 'system', null, `Uploaded update package ${file.originalname}`)).catch(() => undefined); }
  }

  /** Download a package from a link (avoids upload size limits on shared hosting). */
  @ManualTx()
  @Post('download')
  async download(@Body() d: UrlDto, @Req() req: any) {
    this.supported();
    const target = path.join(incoming(), `${randomBytes(12).toString('hex')}.zip`);
    try {
      const res = await fetch(d.url, { redirect: 'follow', signal: AbortSignal.timeout(15 * 60_000) });
      if (!res.ok || !res.body) throw new Error(`The link answered with HTTP ${res.status}`);
      if (Number(res.headers.get('content-length') || 0) > MAX_PACKAGE) throw new Error('The package is larger than 1 GB');
      let size = 0;
      const body = Readable.fromWeb(res.body as any);
      body.on('data', (c: Buffer) => { size += c.length; if (size > MAX_PACKAGE) body.destroy(new Error('The package is larger than 1 GB')); });
      await pipeline(body, fs.createWriteStream(target));
      const info = await updater().stage(target);
      await this.db.withContext(req.ctx, () => this.audit.log('system.update.download', 'system', null, `Downloaded update package from ${new URL(d.url).host}`));
      return info;
    } catch (e: any) {
      throw new BadRequestException(`Could not get the package: ${e.message}`);
    } finally { fs.rmSync(target, { force: true }); }
  }

  /** Install the checked package: safety backup → new code → restart → database changes → confirm (or automatic rollback). */
  @Post('apply')
  async apply(@Body() d: ConfirmDto) {
    this.supported();
    await this.checkPassword(d.password);
    const st = updater().status().state;
    if (!st || st.state !== 'staged') throw new BadRequestException('Upload an update package first.');
    await this.audit.log('system.update.apply', 'system', null, `Started update ${st.current} → ${st.build}`);
    // Runs after this request's transaction has committed: the backup pauses the database and the app restarts.
    setTimeout(() => updater().apply(logFn(this.log)).catch((e: any) => this.log.error(`Update failed: ${e.message}`)), 1000);
    return { ok: true };
  }

  @Post('cancel')
  cancel() { this.supported(); updater().cancel(); return { ok: true }; }

  /** Back to the previous version, with the database as it was just before that update. */
  @Post('rollback')
  async rollback(@Body() d: ConfirmDto) {
    this.supported();
    await this.checkPassword(d.password);
    const s = updater().status();
    if (!s.previous) throw new BadRequestException('There is no previous version to return to.');
    await this.audit.log('system.update.rollback', 'system', null, `Rolled back ${s.current} → ${s.previous}`);
    setTimeout(() => { try { updater().rollback(logFn(this.log)); } catch (e: any) { this.log.error(`Rollback failed: ${e.message}`); } }, 1000);
    return { ok: true };
  }
}
