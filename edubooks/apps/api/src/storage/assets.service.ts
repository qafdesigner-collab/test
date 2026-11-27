import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { digitalAssets } from '../db/schema';
import { config } from '../config';
import { protectionFor } from '../common/protection';
import { createDriver } from './storage.driver';
import { extOf, FILE_TYPES } from './file-types';
import { scanFile } from './scanner';
import { compressPdf, ghostscript } from './pdf-compress';
import { appTmp } from '../common/tmp';

export interface UploadedTemp { path: string; originalname: string; size: number }

/** Key and counter block for one protected link, derived from the link's random nonce and the server secret. */
function streamKey(nonce: string) {
  const key = createHmac('sha256', config.fileUrlSecret).update(`pdf-key:${nonce}`).digest();
  const iv = createHmac('sha256', config.fileUrlSecret).update(`pdf-iv:${nonce}`).digest().subarray(0, 16);
  iv[15] = 0; iv[14] = 0; iv[13] = 0; iv[12] = 0; // room for the block counter (as WebCrypto AES-CTR with length 32 expects)
  return { key, iv };
}

@Injectable()
export class AssetsService {
  readonly driver = createDriver();

  /**
   * Validate, scan and store an uploaded temp file. Content-addressed: if the same bytes were uploaded
   * before (same SHA-256 for this publisher), the existing asset is reused and nothing is stored twice.
   */
  async ingest(file: UploadedTemp): Promise<{ asset: typeof digitalAssets.$inferSelect; reused: boolean; kind: (typeof FILE_TYPES)[string] }> {
    const ctx = this.db.ctx;
    try {
      const ext = extOf(file.originalname);
      const kind = FILE_TYPES[ext];
      if (!kind) throw new BadRequestException(`"${file.originalname}": file type .${ext || '?'} is not allowed`);
      if (!file.size) throw new BadRequestException(`"${file.originalname}" is empty`);
      const head = Buffer.alloc(4096);
      const fd = await fs.promises.open(file.path, 'r');
      const { bytesRead } = await fd.read(head, 0, 4096, 0); await fd.close();
      if (!kind.sniff(head.subarray(0, bytesRead))) {
        throw new UnprocessableEntityException(`"${file.originalname}" does not look like a real .${ext} file`);
      }
      const sha256 = await new Promise<string>((res, rej) => {
        const h = createHash('sha256');
        fs.createReadStream(file.path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
      });
      const [existing] = await this.db.q.select().from(digitalAssets)
        .where(and(eq(digitalAssets.publisherId, ctx.publisherId), eq(digitalAssets.sha256, sha256)));
      if (existing) {
        if (existing.scanStatus === 'INFECTED') throw new UnprocessableEntityException('This file was flagged as malware');
        return { asset: existing, reused: true, kind };
      }
      const scan = await scanFile(file.path);
      if (scan === 'INFECTED') throw new UnprocessableEntityException(`"${file.originalname}" was blocked by the malware scanner`);
      const storageKey = `${ctx.publisherId}/${sha256.slice(0, 2)}/${sha256}.${ext}`;
      await this.driver.putFile(storageKey, file.path, kind.mime);
      const [asset] = await this.db.q.insert(digitalAssets).values({
        publisherId: ctx.publisherId, sha256, storageKey, originalName: file.originalname.slice(0, 250), mimeType: kind.mime, ext,
        sizeBytes: file.size, scanStatus: scan, scannedAt: scan === 'CLEAN' ? new Date() : null, uploadedBy: ctx.userId,
      }).returning();
      if (ext === 'pdf') this.compressLater(asset.id, storageKey, file.size);
      return { asset, reused: false, kind };
    } finally {
      fs.promises.rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  private readonly log = new Logger('PdfCompress');
  /**
   * After a PDF is uploaded it is made smaller in the background (Ghostscript), and the stored file is replaced
   * when that saved at least 10%. Uploading stays as fast as before; the smaller file is what readers download.
   */
  compressLater(assetId: string, storageKey: string, size: number) {
    if (!ghostscript() || size < 1048576) return;
    const ctx = { ...this.db.ctx };
    setImmediate(async () => {
      const id = randomBytes(8).toString('hex'); const src = path.join(appTmp(), `cmp-${id}.pdf`); const out = path.join(appTmp(), `cmp-${id}.out.pdf`);
      try {
        // the upload's own transaction must have committed first
        let row: typeof digitalAssets.$inferSelect | undefined;
        for (let i = 0; i < 120 && !row; i++) {
          [row] = await this.db.detached(ctx, () => this.db.q.select().from(digitalAssets).where(eq(digitalAssets.id, assetId)));
          if (!row) await new Promise((r) => setTimeout(r, 1000));
        }
        if (!row) return;
        await pipeline(await this.driver.read(storageKey), fs.createWriteStream(src));
        await compressPdf(src, out);
        const small = (await fs.promises.stat(out)).size;
        const head = Buffer.alloc(5); const fd = await fs.promises.open(out, 'r'); await fd.read(head, 0, 5, 0); await fd.close();
        if (head.toString() !== '%PDF-' || small > size * 0.9) { this.log.log(`${row.originalName}: kept (${size} → ${small} bytes)`); return; }
        await this.driver.putFile(storageKey, out, 'application/pdf');
        await this.db.detached(ctx, () => this.db.q.update(digitalAssets).set({ sizeBytes: small }).where(eq(digitalAssets.id, assetId)));
        this.log.log(`${row.originalName}: ${(size / 1048576).toFixed(1)} MB → ${(small / 1048576).toFixed(1)} MB`);
      } catch (e: any) { this.log.warn(`${assetId}: not compressed (${e.message})`); }
      finally { fs.rmSync(src, { force: true }); fs.rmSync(out, { force: true }); }
    });
  }

  // ---------- short-lived signed URLs (no permanent public links) ----------
  private sign(payload: string) { return createHmac('sha256', config.fileUrlSecret).update(payload).digest('base64url'); }

  async link(assetId: string, download: boolean) {
    const ctx = this.db.ctx;
    const [a] = await this.db.q.select().from(digitalAssets).where(eq(digitalAssets.id, assetId));
    if (!a) throw new NotFoundException('File not found');
    const allowed = ctx.staff || (this.accessChecker ? await this.accessChecker(assetId) : false);
    if (!allowed) throw new ForbiddenException('You do not have access to this file');
    const { protect } = await protectionFor(this.db);
    // Downloading book files is for the publisher's own staff only; teachers and students view or play them inside the platform.
    if (download && !ctx.staff) throw new ForbiddenException('Book files can only be viewed inside the platform');
    const exp = Math.floor(Date.now() / 1000) + config.fileUrlTtlSec;
    // Protected PDFs are sent encrypted with a one-time key that only the platform's own reader receives:
    // a copied link, or a file saved from the browser's network tools, is not a readable PDF.
    const x = protect && a.ext === 'pdf' ? randomBytes(12).toString('base64url') : undefined;
    const payload = Buffer.from(JSON.stringify({ a: a.id, p: a.publisherId, u: ctx.userId, e: exp, d: download ? 1 : 0, ...(protect ? { v: 1 } : {}), ...(x ? { x } : {}) })).toString('base64url');
    const enc = x ? streamKey(x) : null;
    return { url: `/api/files/${payload}.${this.sign(payload)}`, expiresAt: new Date(exp * 1000), viewOnly: protect,
      ...(enc ? { enc: { alg: 'AES-CTR', key: enc.key.toString('base64'), iv: enc.iv.toString('base64') } } : {}) };
  }

  /** Set by the licensing module: decides access for school users from their licence entitlements. */
  private accessChecker?: (assetId: string) => Promise<boolean>;
  setAccessChecker(fn: (assetId: string) => Promise<boolean>) { this.accessChecker = fn; }

  /** Encrypts a file stream for a protected link (AES-256-CTR keeps the length, so the size header stays right). */
  /** Encrypts a file stream for a protected link, starting at byte `start` (so a part of the file can be sent). */
  encryptor(nonce: string, start = 0) {
    const k = streamKey(nonce); const iv = Buffer.from(k.iv);
    iv.writeUInt32BE((iv.readUInt32BE(12) + Math.floor(start / 16)) >>> 0, 12); // the counter block where `start` lies
    const c = createCipheriv('aes-256-ctr', k.key, iv);
    if (start % 16) c.update(Buffer.alloc(start % 16)); // skip into the block
    return c;
  }

  verifyToken(token: string): { a: string; p: string; u?: string; d: number; v?: number; x?: string } {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) throw new ForbiddenException('Invalid link');
    const expected = Buffer.from(this.sign(payload)); const got = Buffer.from(sig);
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) throw new ForbiddenException('Invalid link');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.e < Date.now() / 1000) throw new ForbiddenException('This link has expired — please open the file again');
    return data;
  }

  constructor(private readonly db: DbService) {}
}
