import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Res, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { Response } from 'express';
import { sql } from 'drizzle-orm';
import { Roles } from '../common/decorators';
import { visibleFor } from '../common/visibility';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../lms/access.service';
import { LmsModule } from '../lms/lms.module';
import { AiModule } from '../ai/ai.module';
import { IndexerService } from '../ai/indexer.service';
import { installStatus, installedVoices, LANG_LABELS, langOf, piperCommand, removeVoice, saveVoiceSettings, speak, startInstall, uninstall, voiceReady, voiceSettings, VOICES } from './piper';

class SayDto { @IsString() @MaxLength(4000) text!: string; @IsOptional() @IsIn(['en', 'ar', 'hi', 'fr']) lang?: 'en' | 'ar' | 'hi' | 'fr'; }
class InstallDto { @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) voices!: string[]; }
class SettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsObject() voices?: Record<string, string>;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.6) @Max(1.5) speed?: number;
}
const READERS = ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'PUBLISHER_ADMIN', 'PUBLISHER_EDITOR'];

/** Natural reading voice (Piper): pages, Owl's answers and notes are read with a human-like voice made on the server. */
@ApiTags('voice')
@Controller('voice')
export class VoiceController {
  constructor(private readonly db: DbService, private readonly access: AccessService, private readonly indexer: IndexerService, private readonly audit: AuditService) {}

  /** Which languages have a natural voice (the reader uses the device's voice for the others). */
  @Roles(...READERS) @Get('status')
  status() { const s = voiceSettings(); const ready = voiceReady(); return { ready, langs: ready ? Object.entries(s.voices).filter(([, v]) => !!v).map(([l]) => l) : [] }; }

  @Roles(...READERS) @Throttle({ default: { limit: 60, ttl: 60_000 } }) @Post('say')
  async say(@Body() d: SayDto, @Res() res: Response) { return this.send(res, d.text, d.lang); }

  /** A page of a book read aloud (only for readers who hold the book). */
  @Roles(...READERS) @Throttle({ default: { limit: 60, ttl: 60_000 } }) @Get('components/:id/pages/:page')
  async page(@Param('id', new ParseUUIDPipe()) id: string, @Param('page', ParseIntPipe) page: number, @Res() res: Response) {
    const [c] = (await this.db.q.execute(sql`SELECT edition_id AS "editionId", visible_to AS vis FROM book_components WHERE id = ${id}`)).rows as any[];
    if (!c) throw new NotFoundException('Book part not found');
    await this.access.assertEdition(c.editionId);
    const vis = visibleFor(this.db.ctx); if (vis && !vis.includes(c.vis)) throw new NotFoundException('Book part not found');
    const text = async () => String(((await this.db.q.execute(sql`SELECT text_content AS t FROM book_pages WHERE component_id = ${id} AND page_number = ${page}`)).rows[0] as any)?.t ?? '');
    let t = await text();
    if (t.trim().length <= 20) { const r = await this.indexer.ensurePageText(id, [page]).catch(() => null); if (r?.read) t = await text(); }
    if (t.trim().length <= 20) throw new NotFoundException('This page has no words to read');
    return this.send(res, t);
  }

  private async send(res: Response, text: string, lang?: 'en' | 'ar' | 'hi' | 'fr') {
    if (!voiceReady()) throw new ServiceUnavailableException('The natural voice is not installed');
    const l = lang ?? langOf(text);
    if (l === 'ur' || !voiceSettings().voices[l]) { res.status(204).end(); return; } // no natural voice for this language: the device reads it
    const r = await speak(text, l).catch((e) => { throw new ServiceUnavailableException(e.message); });
    if (!r) { res.status(204).end(); return; }
    res.setHeader('Cache-Control', 'private, max-age=86400'); res.type(r.mime);
    res.sendFile(r.file);
  }

  // ---------- super admin ----------
  @Roles('PUBLISHER_ADMIN') @Get('admin')
  admin() {
    return { catalog: Object.entries(VOICES).map(([id, v]) => ({ id, lang: v.lang, label: v.label, mb: v.mb })), languages: LANG_LABELS, installed: installedVoices(),
      piper: !!piperCommand(), settings: voiceSettings(), install: installStatus(), ready: voiceReady(), linux: process.platform === 'linux' && process.arch === 'x64' };
  }
  @Roles('PUBLISHER_ADMIN') @Post('install')
  async install(@Body() d: InstallDto) {
    let st; try { st = startInstall(d.voices); } catch (e: any) { throw new BadRequestException(e.message); }
    await this.audit.log('voice.install', 'publisher', this.db.ctx.publisherId, `Started installing the natural voice: ${d.voices.map((v) => VOICES[v]?.label ?? v).join(', ')}`);
    return st;
  }
  @Roles('PUBLISHER_ADMIN') @Put('settings')
  async settings(@Body() d: SettingsDto) {
    const voices = Object.fromEntries(Object.entries(d.voices ?? {}).filter(([l, v]) => l in LANG_LABELS && installedVoices().includes(v)));
    const s = saveVoiceSettings({ ...(d.enabled !== undefined ? { enabled: d.enabled } : {}), ...(d.speed ? { speed: d.speed } : {}), voices });
    await this.audit.log('voice.settings', 'publisher', this.db.ctx.publisherId, `Natural voice ${s.enabled ? 'on' : 'off'}, speed ${s.speed}`);
    return s;
  }
  @Roles('PUBLISHER_ADMIN') @Delete('voices/:id')
  removeOne(@Param('id') id: string) { if (!VOICES[id]) throw new NotFoundException('Unknown voice'); if (installStatus().state === 'running') throw new BadRequestException('Voices are being installed right now'); removeVoice(id); return { ok: true }; }
  @Roles('PUBLISHER_ADMIN') @Delete()
  async remove() { if (installStatus().state === 'running') throw new BadRequestException('Voices are being installed right now'); uninstall(); await this.audit.log('voice.remove', 'publisher', this.db.ctx.publisherId, 'Removed the natural voice'); return { ok: true }; }
}

@Module({ imports: [LmsModule, AiModule], controllers: [VoiceController] })
export class VoiceModule {}
