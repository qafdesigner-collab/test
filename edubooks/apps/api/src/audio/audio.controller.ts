import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { randomBytes, randomUUID } from 'crypto';
import { Response } from 'express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { ManualTx, Roles } from '../common/decorators';
import { appTmp } from '../common/tmp';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';
import { AssetsService } from '../storage/assets.service';
import { StorageModule } from '../storage/storage.module';

const MAX_BYTES = 8 * 1048576; // ~8 minutes of voice
/** Recorded audio formats: what browsers' MediaRecorder produces, plus common phone formats. */
const AUDIO: { ext: string; mime: string; sniff: (h: Buffer) => boolean }[] = [
  { ext: 'webm', mime: 'audio/webm', sniff: (h) => h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3 },
  { ext: 'ogg', mime: 'audio/ogg', sniff: (h) => h.subarray(0, 4).toString('latin1') === 'OggS' },
  { ext: 'm4a', mime: 'audio/mp4', sniff: (h) => h.subarray(4, 8).toString('latin1') === 'ftyp' },
  { ext: 'mp3', mime: 'audio/mpeg', sniff: (h) => h.subarray(0, 3).toString('latin1') === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) },
  { ext: 'wav', mime: 'audio/wav', sniff: (h) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WAVE' },
];

class UploadDto {
  @IsIn(['MESSAGE', 'READING']) kind!: 'MESSAGE' | 'READING';
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(15 * 60_000) durationMs?: number;
}

@Injectable()
export class AudioService {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly assets: AssetsService) {}
  private async rows(q: ReturnType<typeof sql>) { return (await this.db.q.execute(q)).rows as any[]; }

  async upload(file: Express.Multer.File | undefined, d: UploadDto) {
    try {
      if (!file) throw new BadRequestException('No recording received');
      if (!this.db.ctx.schoolId) throw new ForbiddenException('Recordings belong to a school account');
      if (!file.size || file.size > MAX_BYTES) throw new BadRequestException('The recording is empty or too long');
      const fd = await fs.promises.open(file.path, 'r'); const head = Buffer.alloc(16);
      await fd.read(head, 0, 16, 0); await fd.close();
      const type = AUDIO.find((a) => a.sniff(head));
      if (!type) throw new BadRequestException('This is not a sound recording we can play');
      const id = randomUUID();
      const key = `${this.db.ctx.publisherId}/audio/${this.db.ctx.schoolId}/${id}.${type.ext}`;
      await this.assets.driver.putFile(key, file.path, type.mime);
      await this.db.q.execute(sql`INSERT INTO audio_clips (id, publisher_id, school_id, owner_id, kind, storage_key, mime, size_bytes, duration_ms)
        VALUES (${id}, ${this.db.ctx.publisherId}, ${this.db.ctx.schoolId}, ${this.db.ctx.userId}, ${d.kind}, ${key}, ${type.mime}, ${file.size}, ${d.durationMs ?? 0})`);
      return { id, mime: type.mime, durationMs: d.durationMs ?? 0 };
    } finally { if (file?.path) fs.promises.rm(file.path, { force: true }).catch(() => undefined); }
  }

  /** Who may listen: the speaker, the school admin, the other side of the chat, the pupil's teachers and parents. */
  private async allowed(c: any) {
    const me = this.db.ctx.userId;
    if (c.owner_id === me || this.access.is('SCHOOL_ADMIN')) return true;
    if (c.kind === 'MESSAGE') {
      const [m] = await this.rows(sql`SELECT 1 FROM messages m JOIN conversations v ON v.id = m.conversation_id WHERE m.audio_id = ${c.id} AND (v.parent_id = ${me} OR v.staff_id = ${me})`);
      return !!m;
    }
    if (this.access.is('TEACHER')) {
      const mine = await this.access.teacherClassIds();
      if (mine.length) { const [e] = await this.rows(sql`SELECT 1 FROM enrolments WHERE student_id = ${c.owner_id} AND class_id = ANY(${`{${mine.join(',')}}`}::uuid[])`); if (e) return true; }
    }
    const [p] = await this.rows(sql`SELECT 1 FROM parent_students WHERE parent_id = ${me} AND student_id = ${c.owner_id}`);
    return !!p;
  }

  async open(id: string) {
    const [c] = await this.rows(sql`SELECT * FROM audio_clips WHERE id = ${id}`);
    if (!c) throw new NotFoundException('Recording not found');
    if (!(await this.allowed(c))) throw new ForbiddenException('You cannot listen to this recording');
    const stream = await this.assets.driver.read(c.storage_key);
    const chunks: Buffer[] = [];
    for await (const ch of stream as any) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
    return { mime: c.mime as string, data: Buffer.concat(chunks) };
  }
}

/** Voice notes and read-aloud recordings. Under /messages so parent accounts (limited to their areas) can use them. */
@ApiTags('audio')
@Controller('messages/audio')
export class AudioController {
  constructor(private readonly svc: AudioService, private readonly db: DbService) {}

  @Roles('SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'STUDENT') @ManualTx() @Post()
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: appTmp('uploads'), filename: (_r: any, _f: any, cb: any) => cb(null, randomBytes(16).toString('hex')) }), limits: { fileSize: MAX_BYTES, files: 1 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Body() d: UploadDto, @Req() req: any) { return this.db.withContext(req.ctx, () => this.svc.upload(file, d)); }

  /** Streams a recording (with byte ranges, which phones need to play audio). */
  @SkipThrottle() @Roles('SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'STUDENT') @Get(':id')
  async play(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any, @Res() res: Response) {
    const { mime, data } = await this.svc.open(id);
    res.setHeader('Content-Type', mime); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Cache-Control', 'private, max-age=86400'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
    if (m) {
      const start = m[1] ? Number(m[1]) : Math.max(0, data.length - Number(m[2] || 0)); const end = m[1] && m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
      if (start >= data.length || start > end) { res.status(416).setHeader('Content-Range', `bytes */${data.length}`); return res.end(); }
      res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${data.length}`); res.setHeader('Content-Length', String(end - start + 1));
      return res.end(data.subarray(start, end + 1));
    }
    res.setHeader('Content-Length', String(data.length)); res.end(data);
  }
}

@Module({ imports: [LmsModule, StorageModule], controllers: [AudioController], providers: [AudioService] })
export class AudioModule {}
