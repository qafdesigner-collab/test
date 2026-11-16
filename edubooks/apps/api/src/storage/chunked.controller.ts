import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ManualTx, PUBLISHER_STAFF, Roles } from '../common/decorators';
import { appTmp } from '../common/tmp';

/**
 * Big files (e.g. a 300 MB Android app) are sent in small pieces: each piece is its own short request, so host
 * time limits and per-request size limits (cPanel, Cloudflare) do not cut the upload, a dropped piece is simply
 * sent again, and an interrupted upload continues where it stopped.
 */
export const CHUNK = 8 * 1048576;
const MAX_BYTES = Number(process.env.BIG_UPLOAD_MAX_MB || 2048) * 1048576;
const KEEP_MS = 24 * 3600_000;

interface Meta { id: string; userId: string; name: string; size: number; key: string; received: number[]; createdAt: number }
class StartDto {
  @IsString() @Length(1, 250) name!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_BYTES) size!: number;
  /** Same file again (name + size + last modified) → the earlier upload continues. */
  @IsString() @Length(1, 400) key!: string;
}

@Injectable()
export class ChunkedUploads {
  private dir() { return appTmp('chunked'); }
  private metaPath(id: string) { return path.join(this.dir(), `${id}.json`); }
  private partPath(id: string) { return path.join(this.dir(), `${id}.part`); }
  private read(id: string): Meta {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new NotFoundException('Upload not found');
    try { return JSON.parse(fs.readFileSync(this.metaPath(id), 'utf8')); } catch { throw new NotFoundException('This upload has expired — choose the file again'); }
  }
  private write(m: Meta) { fs.writeFileSync(this.metaPath(m.id), JSON.stringify(m)); }
  private cleanup() {
    for (const f of fs.readdirSync(this.dir())) {
      const p = path.join(this.dir(), f);
      try { if (Date.now() - fs.statSync(p).mtimeMs > KEEP_MS) fs.rmSync(p, { force: true }); } catch { /* ignore */ }
    }
  }
  pieces(size: number) { return Math.ceil(size / CHUNK); }

  start(userId: string, d: StartDto) {
    this.cleanup();
    const id = createHash('sha256').update(`${userId}|${d.key}|${d.size}`).digest('hex').slice(0, 32);
    let m: Meta | null = null;
    try { m = this.read(id); } catch { m = null; }
    if (!m || m.size !== d.size || !fs.existsSync(this.partPath(id))) {
      m = { id, userId, name: d.name, size: d.size, key: d.key, received: [], createdAt: Date.now() };
      fs.writeFileSync(this.partPath(id), Buffer.alloc(0)); fs.truncateSync(this.partPath(id), d.size);
      this.write(m);
    }
    return { id, chunkSize: CHUNK, pieces: this.pieces(d.size), received: m.received };
  }

  async piece(userId: string, id: string, index: number, req: NodeJS.ReadableStream & { headers: any }) {
    const m = this.read(id);
    if (m.userId !== userId) throw new ForbiddenException();
    const n = this.pieces(m.size);
    if (!Number.isInteger(index) || index < 0 || index >= n) throw new BadRequestException('Bad piece number');
    const expected = index === n - 1 ? m.size - index * CHUNK : CHUNK;
    if (Number(req.headers['content-length']) !== expected) throw new BadRequestException(`Piece ${index + 1} must be ${expected} bytes`);
    await new Promise<void>((ok, fail) => {
      let got = 0;
      const out = fs.createWriteStream(this.partPath(id), { flags: 'r+', start: index * CHUNK });
      req.on('data', (c: Buffer) => { got += c.length; if (got > expected) { out.destroy(); fail(new BadRequestException('Piece too large')); } });
      req.on('error', fail); out.on('error', fail);
      out.on('finish', () => (got === expected ? ok() : fail(new BadRequestException('The piece did not arrive completely — it will be sent again'))));
      req.pipe(out);
    });
    const fresh = this.read(id); // other pieces may have finished meanwhile
    if (!fresh.received.includes(index)) fresh.received.push(index);
    this.write(fresh);
    return { received: fresh.received.length, pieces: n };
  }

  status(userId: string, id: string) {
    const m = this.read(id); if (m.userId !== userId) throw new ForbiddenException();
    return { id, received: m.received, pieces: this.pieces(m.size) };
  }

  /** The finished file (all pieces in place). The caller moves it into storage and then calls done(). */
  take(userId: string, id: string) {
    const m = this.read(id); if (m.userId !== userId) throw new ForbiddenException();
    const missing = this.pieces(m.size) - new Set(m.received).size;
    if (missing > 0) throw new BadRequestException(`${missing} piece(s) are still missing — the upload will continue`);
    return { path: this.partPath(id), originalname: m.name, size: m.size, done: () => { fs.rmSync(this.metaPath(id), { force: true }); fs.rmSync(this.partPath(id), { force: true }); } };
  }
}

@ApiTags('uploads')
@Controller('uploads')
export class ChunkedController {
  constructor(private readonly up: ChunkedUploads) {}
  @Roles(...PUBLISHER_STAFF) @Post() start(@Req() req: any, @Body() d: StartDto) { return this.up.start(req.ctx.userId, d); }
  @Roles(...PUBLISHER_STAFF) @Get(':id') status(@Req() req: any, @Param('id') id: string) { return this.up.status(req.ctx.userId, id); }
  @SkipThrottle() @ManualTx() @Roles(...PUBLISHER_STAFF) @Put(':id/:index') @HttpCode(200)
  piece(@Req() req: any, @Param('id') id: string, @Param('index') index: string) { return this.up.piece(req.ctx.userId, id, Number(index), req); }
}
