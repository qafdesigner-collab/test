import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { ManualTx, Public } from '../common/decorators';
import { DbService } from '../db/db.service';
import { digitalAssets } from '../db/schema';
import { AssetsService } from './assets.service';
import { FILE_TYPES } from './file-types';

@ApiTags('files')
@Controller()
export class FilesController {
  constructor(private readonly assets: AssetsService, private readonly db: DbService) {}

  /** Issue a short-lived signed URL after an authorisation check. */
  @Get('assets/:id/link')
  link(@Param('id', ParseUUIDPipe) id: string, @Query('download') download?: string) {
    return this.assets.link(id, download === '1');
  }

  /** Stream a file. The signed token IS the authorisation (it expires after a few minutes). */
  @Public() @SkipThrottle() @ManualTx()
  @Get('files/:token')
  async file(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const t = this.assets.verifyToken(token);
    // View-only links work inside the platform's viewers (fetch, <img>, <video>, sandboxed frames) but not as a page of their own.
    const dest = String(req.headers['sec-fetch-dest'] ?? '');
    if (t.v && ['document', 'embed', 'object'].includes(dest)) { res.status(403).type('text/plain').send('This file can only be viewed inside the platform.'); return; }
    const asset = await this.db.withContext({ userId: '', publisherId: t.p, schoolId: null, roles: [], staff: false }, async () =>
      (await this.db.q.select().from(digitalAssets).where(eq(digitalAssets.id, t.a)))[0]);
    if (!asset) throw new NotFoundException();
    const kind = FILE_TYPES[asset.ext];
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Length', String(asset.sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', t.v ? 'no-store' : 'private, max-age=300');
    // Active content (HTML/SVG) runs in an opaque, sandboxed origin: it can never read the LMS session.
    if (kind?.active) res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-popups allow-forms allow-modals');
    const safeName = asset.originalName.replace(/[^\w.\- ]+/g, '_');
    res.setHeader('Content-Disposition', `${t.d && !t.v ? 'attachment' : 'inline'}; filename="${safeName}"`);
    (await this.assets.driver.read(asset.storageKey)).on('error', () => res.destroy()).pipe(res);
  }
}
