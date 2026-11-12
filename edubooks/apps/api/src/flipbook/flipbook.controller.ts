import { guardScript } from '../common/protection';
import { BadRequestException, Controller, Delete, Get, Module, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ManualTx, PUBLISHER_STAFF, Public, Roles } from '../common/decorators';
import { DbService } from '../db/db.service';
import { LmsModule } from '../lms/lms.module';
import { StorageModule } from '../storage/storage.module';
import { FlipbookService } from './flipbook.service';
import { appTmp } from '../common/tmp';

const TMP = appTmp('uploads');
const MAX_MB = Number(process.env.FLIPBOOK_MAX_MB || 1024);

/** Headers for every flipbook response: framed only by the LMS, scripts sandboxed into an opaque origin. */
function flipHeaders(res: Response, mime: string) {
  res.setHeader('Content-Type', mime);
  res.removeHeader('X-Frame-Options');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // loaded by the sandboxed (opaque-origin) page
  res.setHeader('Access-Control-Allow-Origin', '*');              // no cookies are ever sent or needed
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const active = /html|svg|xml/.test(mime);
  res.setHeader('Content-Security-Policy', active
    ? "sandbox allow-scripts allow-popups allow-forms allow-modals allow-pointer-lock allow-downloads allow-presentation; frame-ancestors 'self'"
    : "frame-ancestors 'self'");
}

@ApiTags('flipbooks')
@Controller()
export class FlipbookController {
  constructor(private readonly svc: FlipbookService, private readonly db: DbService) {}

  @Roles(...PUBLISHER_STAFF) @ManualTx()
  @Post('publishing/components/:id/flipbook')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({ destination: TMP, filename: (_r: any, _f: any, cb: any) => cb(null, randomBytes(16).toString('hex')) }),
    limits: { fileSize: MAX_MB * 1048576, files: 1 },
  }))
  upload(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('Choose the flipbook (.zip with index.html, or .swf)');
    return this.db.withContext(req.ctx, () => this.svc.upload(id, file));
  }

  @Roles(...PUBLISHER_STAFF)
  @Delete('publishing/components/:id/flipbook')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(id); }

  /** Signed address for the reader (licence checked). */
  @Get('reader/components/:id/flipbook')
  link(@Param('id', ParseUUIDPipe) id: string) { return this.svc.link(id); }

  @Public() @SkipThrottle() @ManualTx()
  @Get('flip/:token/*path')
  async serve(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const raw = (req.params as any).path;
    const segs: string[] = (Array.isArray(raw) ? raw : String(raw).split('/')).map((s: string) => { try { return decodeURIComponent(s); } catch { return '\0'; } });
    if (!segs.length || segs.some((s) => !s || s === '.' || s === '..' || s.includes('\0') || s.includes('/') || s.includes('\\'))) throw new NotFoundException();
    const base = `/api/flip/${token}`;
    if (segs[0] === '__ruffle' && segs.length === 2) {
      this.svc.verify(token);
      const r = this.svc.ruffleFile(segs[1]);
      flipHeaders(res, r.mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return fs.createReadStream(r.path).on('error', () => res.destroy()).pipe(res);
    }
    const t = this.svc.verify(token);
    // Protected readers: the flipbook works only inside the reader's frame, not opened as a page of its own.
    if (t.protect && String(req.headers['sec-fetch-dest'] ?? '') === 'document') { res.status(403).type('text/plain').send('This book can only be read inside the platform.'); return; }
    const f = await this.svc.file(token, segs.join('/'));
    flipHeaders(res, f.mime);
    if (t.protect) res.setHeader('Cache-Control', 'no-store');
    const stream = await this.svc['assets'].driver.read(f.key);
    if ((f.kind === 'SWF' || t.protect) && f.mime.startsWith('text/html')) {
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(c as Buffer);
      let html = Buffer.concat(chunks).toString('utf8');
      if (t.protect) html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + guardScript(t.watermark)) : guardScript(t.watermark) + html;
      if (f.kind === 'SWF') html = this.svc.injectRuffle(html, base);
      res.setHeader('Content-Length', String(Buffer.byteLength(html)));
      return res.end(html);
    }
    res.setHeader('Content-Length', String(f.size));
    stream.on('error', () => res.destroy()).pipe(res);
  }
}

@Module({ imports: [LmsModule, StorageModule], controllers: [FlipbookController], providers: [FlipbookService], exports: [FlipbookService] })
export class FlipbookModule {}
