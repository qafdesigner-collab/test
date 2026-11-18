import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { config } from '../config';
import { DbService } from '../db/db.service';
import { open } from '../common/secret-box';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';
import { AiProvider } from './providers/types';

const offline: AiProvider = {
  name: 'offline', model: 'offline-drafter', live: false,
  generate: async () => { throw new Error('offline provider has no model'); },
  health: async () => ({ ok: true, detail: 'No AI model connected — the assistant produces clearly-labelled offline drafts from the book data.' }),
};

/**
 * Ready-made connections to AI services with a free plan (a free API key from the service's website), and the
 * publisher's own server. All speak the OpenAI-compatible API. Model names can be changed in the settings.
 */
export const AI_PRESETS: Record<string, { label: string; baseUrl: string; model: string; keyUrl?: string; note: string }> = {
  gemini: { label: 'Google Gemini (free plan)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free API key from Google AI Studio. Good quality, many languages (English, Arabic, Urdu). Free plan has daily limits; Google may use free-plan requests to improve its products.' },
  groq: { label: 'Groq (free plan)', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys',
    note: 'Free API key from Groq. Very fast open models (Llama). Free plan has per-minute and daily limits.' },
  openrouter: { label: 'OpenRouter (free models)', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys',
    note: 'Free API key from OpenRouter; models ending in “:free” cost nothing. Free models have daily limits and can be busy at times.' },
  ollama: { label: 'Own server (Ollama / LM Studio)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b-instruct',
    note: 'Free, private and unlimited, but needs your own computer or server with the model installed (a normal cPanel host cannot run it).' },
  custom: { label: 'Other (OpenAI-compatible)', baseUrl: '', model: '', note: 'Any service that offers the OpenAI-compatible API.' },
};

/**
 * The AI model in use: the one the super admin connected in the app (Settings → AI), otherwise the server's
 * AI_* environment settings, otherwise offline drafts. Embeddings (semantic search) come from the environment model only.
 */
@Injectable()
export class AiProviderService {
  /** From the environment (also used for embeddings). */
  readonly provider: AiProvider;
  private cache = new Map<string, { at: number; p: AiProvider }>();
  private healthCache = new Map<string, { at: number; value: { ok: boolean; detail: string } }>();
  constructor(private readonly db: DbService) {
    const a = config.ai;
    this.provider = a.provider === 'anthropic' ? new AnthropicProvider(a.model, a.timeoutMs)
      : a.provider === 'openai-compatible' ? new OpenAiCompatibleProvider(a.baseUrl, a.model, a.apiKey, a.timeoutMs, a.embedModel)
        : offline;
  }
  get embeddingsEnabled() { return !!config.ai.embedModel && typeof this.provider.embed === 'function'; }

  /** Builds a provider from saved settings (also used by "Test connection" before saving). */
  build(s: { preset: string; baseUrl: string; model: string; apiKey: string }): AiProvider {
    return new OpenAiCompatibleProvider(s.baseUrl.replace(/\/+$/, ''), s.model, s.apiKey, config.ai.timeoutMs, '', AI_PRESETS[s.preset]?.label ?? s.preset);
  }

  /** The model for the current request's publisher (settings are re-read every 30 s, so all app processes follow a change). */
  async current(): Promise<AiProvider> {
    const pub = this.db.ctx?.publisherId; if (!pub) return this.provider;
    const hit = this.cache.get(pub); if (hit && Date.now() - hit.at < 30_000) return hit.p;
    let p = this.provider;
    try {
      const { rows: [s] } = await this.db.q.execute(sql`SELECT * FROM ai_provider_config()`) as any;
      if (s?.enabled && s.base_url && s.model) p = this.build({ preset: s.preset, baseUrl: s.base_url, model: s.model, apiKey: open(s.api_key) });
    } catch { /* settings not readable: keep the environment model */ }
    this.cache.set(pub, { at: Date.now(), p });
    return p;
  }
  invalidate() { this.cache.clear(); this.healthCache.clear(); }

  async health() {
    const p = await this.current(); const k = `${p.name}|${p.model}`;
    const h = this.healthCache.get(k);
    if (!h || Date.now() - h.at > 60_000) this.healthCache.set(k, { at: Date.now(), value: await p.health() });
    return this.healthCache.get(k)!.value;
  }
}
