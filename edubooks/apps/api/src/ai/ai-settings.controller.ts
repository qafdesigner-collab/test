import { BadRequestException, Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { Roles } from '../common/decorators';
import { AuditService } from '../audit/audit.service';
import { open, seal } from '../common/secret-box';
import { AI_PRESETS, AiProviderService } from './provider.service';

class AiSettingsDto {
  @IsIn(Object.keys(AI_PRESETS)) preset!: string;
  @IsOptional() @IsString() @MaxLength(300) baseUrl?: string;
  @IsString() @MaxLength(120) model!: string;
  /** Leave empty to keep the saved key. */
  @IsOptional() @IsString() @MaxLength(400) apiKey?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

/** Super admin: connect a free AI service (or the publisher's own model server) without touching server settings. */
@ApiTags('ai')
@Controller('ai/settings')
export class AiSettingsController {
  constructor(private readonly db: DbService, private readonly ai: AiProviderService, private readonly audit: AuditService) {}
  private async saved() {
    const { rows: [s] } = await this.db.q.execute(sql`SELECT * FROM publisher_ai_settings WHERE publisher_id = ${this.db.ctx.publisherId}`) as any;
    return s as any;
  }
  private resolve(d: AiSettingsDto, s?: any) {
    const p = AI_PRESETS[d.preset];
    const baseUrl = (d.preset === 'custom' || d.preset === 'ollama' ? d.baseUrl || p.baseUrl : p.baseUrl).trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s/]+/i.test(baseUrl)) throw new BadRequestException('Enter the address of the AI service (it starts with https://)');
    const apiKey = d.apiKey?.trim() || (s && s.preset === d.preset ? open(s.api_key) : '');
    if (!['ollama', 'custom'].includes(d.preset) && !apiKey) throw new BadRequestException('Paste the free API key from the service’s website');
    return { preset: d.preset, baseUrl, model: d.model.trim() || p.model, apiKey };
  }

  @Roles('PUBLISHER_ADMIN') @Get()
  async get() {
    const s = await this.saved();
    return { presets: AI_PRESETS, enabled: !!s?.enabled, preset: s?.preset ?? 'gemini', baseUrl: s?.base_url ?? '', model: s?.model ?? '',
      hasKey: !!s?.api_key, keyHint: s?.api_key ? `••••${open(s.api_key).slice(-4)}` : '', updatedAt: s?.updated_at ?? null };
  }

  /** Sends one tiny question to the service with these settings (not saved). */
  @Roles('PUBLISHER_ADMIN') @Post('test')
  async test(@Body() d: AiSettingsDto) {
    const r = this.resolve(d, await this.saved()); const p = this.ai.build(r); const t = Date.now();
    try {
      const out = await p.generate({ system: 'You are a helpful assistant for a school.', user: 'Reply with exactly: OK, I am ready to help teachers.', maxTokens: 30, json: false });
      return { ok: true, reply: out.text.trim().slice(0, 200), model: out.model, ms: Date.now() - t };
    } catch (e: any) { return { ok: false, error: String(e?.message ?? e).slice(0, 300) }; }
  }

  @Roles('PUBLISHER_ADMIN') @Put()
  async save(@Body() d: AiSettingsDto) {
    const r = this.resolve(d, await this.saved()); const enabled = d.enabled ?? true;
    await this.db.q.execute(sql`INSERT INTO publisher_ai_settings (publisher_id, enabled, preset, base_url, model, api_key, updated_by)
      VALUES (${this.db.ctx.publisherId}, ${enabled}, ${r.preset}, ${r.baseUrl}, ${r.model}, ${seal(r.apiKey)}, ${this.db.ctx.userId})
      ON CONFLICT (publisher_id) DO UPDATE SET enabled = EXCLUDED.enabled, preset = EXCLUDED.preset, base_url = EXCLUDED.base_url, model = EXCLUDED.model,
        api_key = EXCLUDED.api_key, updated_by = EXCLUDED.updated_by, updated_at = now()`);
    this.ai.invalidate();
    await this.audit.log('ai.settings', 'publisher', this.db.ctx.publisherId, `${enabled ? 'Connected' : 'Saved (off)'} AI: ${AI_PRESETS[r.preset].label} · ${r.model}`);
    return this.get();
  }

  /** Back to the server's own setting (or offline drafts). The saved key is removed. */
  @Roles('PUBLISHER_ADMIN') @Delete()
  async off() {
    await this.db.q.execute(sql`DELETE FROM publisher_ai_settings WHERE publisher_id = ${this.db.ctx.publisherId}`);
    this.ai.invalidate();
    await this.audit.log('ai.settings', 'publisher', this.db.ctx.publisherId, 'Disconnected the AI service');
    return this.get();
  }
}
