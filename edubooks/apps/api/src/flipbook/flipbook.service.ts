import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { bookComponents, bookEditions, flipbookFiles, flipbooks } from '../db/schema';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../storage/assets.service';
import { AccessService } from '../lms/access.service';
import { safeUnzip } from './safe-unzip';

/** File types a flipbook may contain. Anything else (programs, server scripts…) is left out. */
export const FLIP_MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', xhtml: 'application/xhtml+xml', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', xml: 'application/xml', txt: 'text/plain; charset=utf-8', csv: 'text/csv',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', m4v: 'video/mp4',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  pdf: 'application/pdf', swf: 'application/x-shockwave-flash', wasm: 'application/wasm', map: 'application/json',
};
const extOf = (p: string) => path.extname(p).slice(1).toLowerCase();
const RUFFLE_DIR = path.dirname(require.resolve('@ruffle-rs/ruffle'));
const TOKEN_HOURS = 6;

@Injectable()
export class FlipbookService {
  private readonly log = new Logger('Flipbook');
  constructor(private readonly db: DbService, private readonly assets: AssetsService, private readonly audit: AuditService, private readonly access: AccessService) {}
  private get q() { return this.db.q; }

  // ---------------------------------------------------------------- upload (publisher staff)
  async upload(componentId: string, file: { path: string; originalname: string; size: number }) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flip-'));
    try {
      const [c] = await this.q.select({ id: bookComponents.id, title: bookComponents.title, editionId: bookComponents.editionId, publisherId: bookComponents.publisherId })
        .from(bookComponents).where(eq(bookComponents.id, componentId));
      if (!c) throw new NotFoundException('Book part not found');
      const [e] = await this.q.select({ status: bookEditions.status }).from(bookEditions).where(eq(bookEditions.id, c.editionId));
      if (e?.status === 'ARCHIVED') throw new ConflictException('This edition is archived.');

      const head = Buffer.alloc(4); const fd = fs.openSync(file.path, 'r'); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
      const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
      const isSwf = ['FWS', 'CWS', 'ZWS'].includes(head.subarray(0, 3).toString('latin1'));
      let files: { path: string; size: number }[]; let skipped = 0;
      if (isZip) {
        ({ files, skipped } = await safeUnzip(file.path, tmp, {
          maxFiles: Number(process.env.FLIPBOOK_MAX_FILES || 20000), maxBytes: Number(process.env.FLIPBOOK_MAX_UNPACKED_MB || 3072) * 1048576,
          allow: (n) => !!FLIP_MIME[extOf(n)],
        }).catch((e: Error) => {
          const m = String(e.message);
          throw new BadRequestException(/relative path|absolute path|unsafe/i.test(m) ? `Unsafe path in the zip: ${m.replace(/^.*?: /, '')}` : m);
        }));
      } else if (isSwf) {
        const name = (path.basename(file.originalname).replace(/[^\w.-]+/g, '_') || 'book.swf').replace(/\.swf$/i, '') + '.swf';
        fs.copyFileSync(file.path, path.join(tmp, name)); files = [{ path: name, size: file.size }];
      } else throw new BadRequestException('Upload a .zip (HTML or Flash flipbook) or a .swf file.');
      if (!files.length) throw new BadRequestException('The zip contains no usable flipbook files.');

      // main page: the shallowest index.html (any case); else the only .html file; else a player for the main .swf
      const depth = (p: string) => p.split('/').length;
      const byDepth = (a: { path: string }, b: { path: string }) => depth(a.path) - depth(b.path) || a.path.length - b.path.length;
      const swfs = files.filter((f) => extOf(f.path) === 'swf').sort((a, b) => byDepth(a, b) || b.size - a.size);
      let entry = files.filter((f) => /^index\.html?$/i.test(path.posix.basename(f.path))).sort(byDepth)[0]?.path;
      const htmls = files.filter((f) => ['html', 'htm'].includes(extOf(f.path)));
      if (!entry && htmls.length === 1) entry = htmls[0].path;
      if (!entry && swfs.length) {
        const main = swfs.find((s) => /(^|\/)(index|main|book|flipbook)\.swf$/i.test(s.path)) ?? swfs[0];
        entry = '__player.html';
        fs.writeFileSync(path.join(tmp, entry), playerPage(main.path));
        files.push({ path: entry, size: fs.statSync(path.join(tmp, entry)).size });
      }
      if (!entry) throw new BadRequestException('No index.html found. The main page of the flipbook must be called index.html.');
      const kind: 'HTML' | 'SWF' = swfs.length ? 'SWF' : 'HTML';

      // store every file, then switch the part to the new flipbook (old files are removed afterwards)
      const id = randomUUID(); const prefix = `${c.publisherId}/flipbooks/${id}`;
      const queue = [...files];
      await Promise.all(Array.from({ length: 6 }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) await this.assets.driver.putFile(`${prefix}/${f.path}`, path.join(tmp, ...f.path.split('/')), FLIP_MIME[extOf(f.path)]);
      }));
      const [old] = await this.q.select().from(flipbooks).where(eq(flipbooks.componentId, componentId));
      const oldFiles = old ? await this.q.select({ path: flipbookFiles.path }).from(flipbookFiles).where(eq(flipbookFiles.flipbookId, old.id)) : [];
      if (old) await this.q.delete(flipbooks).where(eq(flipbooks.id, old.id));
      const total = files.reduce((n, f) => n + f.size, 0);
      const [row] = await this.q.insert(flipbooks).values({
        id, publisherId: c.publisherId, componentId, kind, storagePrefix: prefix, entry, fileCount: files.length, totalBytes: total,
        originalName: file.originalname.slice(0, 200), skippedFiles: skipped, uploadedBy: this.db.ctx.userId,
      }).returning();
      for (let i = 0; i < files.length; i += 1000) {
        await this.q.insert(flipbookFiles).values(files.slice(i, i + 1000).map((f) => ({ flipbookId: id, publisherId: c.publisherId, path: f.path, sizeBytes: f.size, mimeType: FLIP_MIME[extOf(f.path)] })));
      }
      await this.audit.log('publishing.flipbook.upload', 'book_component', componentId, `Uploaded ${kind === 'SWF' ? 'Flash' : 'HTML'} flipbook for “${c.title}” (${files.length} files)`, old ? { entry: old.entry, files: old.fileCount } : undefined, { entry, files: files.length, skipped });
      if (old) setTimeout(() => this.removeFiles(old.storagePrefix, oldFiles.map((f) => f.path)), 2000);
      return this.summary(row);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(file.path, { force: true });
    }
  }

  private async removeFiles(prefix: string, paths: string[]) {
    for (const p of paths) await this.assets.driver.remove(`${prefix}/${p}`).catch(() => undefined);
  }

  summary(f: typeof flipbooks.$inferSelect) {
    return { id: f.id, kind: f.kind, entry: f.entry, fileCount: f.fileCount, totalBytes: f.totalBytes, originalName: f.originalName, skippedFiles: f.skippedFiles, createdAt: f.createdAt };
  }

  async remove(componentId: string) {
    const [f] = await this.q.select().from(flipbooks).where(eq(flipbooks.componentId, componentId));
    if (!f) throw new NotFoundException('This part has no flipbook');
    const files = await this.q.select({ path: flipbookFiles.path }).from(flipbookFiles).where(eq(flipbookFiles.flipbookId, f.id));
    await this.q.delete(flipbooks).where(eq(flipbooks.id, f.id));
    await this.audit.log('publishing.flipbook.remove', 'book_component', componentId, 'Removed the flipbook', this.summary(f));
    setTimeout(() => this.removeFiles(f.storagePrefix, files.map((x) => x.path)), 1000);
    return { ok: true };
  }

  // ---------------------------------------------------------------- reading (licence checked)
  /** Signed, time-limited address of the flipbook; staff preview or a licensed reader only. */
  async link(componentId: string) {
    const [f] = await this.q.select().from(flipbooks).where(eq(flipbooks.componentId, componentId));
    if (!f) throw new NotFoundException('No flipbook has been uploaded for this part');
    if (!this.db.ctx.staff) {
      const [c] = await this.q.select({ editionId: bookComponents.editionId }).from(bookComponents).where(eq(bookComponents.id, componentId));
      await this.access.assertEdition(c.editionId);
    }
    const exp = Math.floor(Date.now() / 1000) + TOKEN_HOURS * 3600;
    const token = this.sign(f.id, f.publisherId, exp);
    return { url: `/api/flip/${token}/${f.entry.split('/').map(encodeURIComponent).join('/')}`, kind: f.kind, expiresAt: new Date(exp * 1000) };
  }

  private mac(payload: string) { return createHmac('sha256', config.fileUrlSecret).update(`flip:${payload}`).digest('base64url').slice(0, 32); }
  private sign(id: string, pub: string, exp: number) {
    const payload = Buffer.from(`${id}.${pub}.${exp}`).toString('base64url');
    return `${payload}.${this.mac(payload)}`;
  }
  verify(token: string) {
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) throw new NotFoundException();
    const a = Buffer.from(this.mac(payload)); const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new NotFoundException();
    const [id, pub, exp] = Buffer.from(payload, 'base64url').toString().split('.');
    if (!id || !pub || Number(exp) < Date.now() / 1000) throw new NotFoundException('This link has expired. Reopen the book.');
    return { id, pub };
  }

  /** Finds one file of a flipbook (RLS: inside the flipbook's publisher). */
  async file(token: string, rel: string) {
    const t = this.verify(token);
    return this.db.withContext({ userId: '', publisherId: t.pub, schoolId: null, roles: [], staff: false }, async () => {
      const [f] = await this.q.select({ prefix: flipbooks.storagePrefix, kind: flipbooks.kind }).from(flipbooks).where(eq(flipbooks.id, t.id));
      if (!f) throw new NotFoundException();
      const [file] = await this.q.select().from(flipbookFiles).where(and(eq(flipbookFiles.flipbookId, t.id), eq(flipbookFiles.path, rel)));
      if (!file) throw new NotFoundException();
      return { key: `${f.prefix}/${file.path}`, mime: file.mimeType, size: file.sizeBytes, kind: f.kind };
    });
  }

  ruffleFile(name: string) {
    if (!/^(ruffle\.js|[\w.-]+\.wasm)$/.test(name)) throw new NotFoundException();
    const p = path.join(RUFFLE_DIR, name);
    if (!fs.existsSync(p)) throw new NotFoundException();
    return { path: p, mime: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8' };
  }

  /** Adds the Flash player (Ruffle) to pages of SWF flipbooks, so <object>/<embed> SWFs play without Flash. */
  injectRuffle(html: string, base: string) {
    const tag = `<script>window.RufflePlayer=window.RufflePlayer||{};window.RufflePlayer.config=Object.assign({publicPath:${JSON.stringify(base + '/__ruffle/')},autoplay:"on",unmuteOverlay:"hidden",splashScreen:false,warnOnUnsupportedContent:false,letterbox:"on",allowScriptAccess:false,openUrlMode:"deny",contextMenu:"off"},window.RufflePlayer.config||{});</script><script src="${base}/__ruffle/ruffle.js"></script>`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + tag) : tag + html;
  }
}

/** Full-screen page that plays one SWF with Ruffle (used when the upload has no index.html). */
function playerPage(swf: string) {
  const src = swf.split('/').map(encodeURIComponent).join('/');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flipbook</title>
<style>html,body{margin:0;height:100%;background:#1e1b4b}#player{width:100%;height:100%}#player ruffle-player,#player ruffle-object,#player>*{width:100%!important;height:100%!important}</style></head>
<body><div id="player"></div><script>
window.addEventListener('load',function(){var r=window.RufflePlayer.newest();var p=r.createPlayer();document.getElementById('player').appendChild(p);p.load({url:${JSON.stringify(src)}});});
</script></body></html>`;
}
