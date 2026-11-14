import { Injectable } from '@nestjs/common';
import { config } from '../config';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';
import { AiProvider } from './providers/types';

const offline: AiProvider = {
  name: 'offline', model: 'offline-drafter', live: false,
  generate: async () => { throw new Error('offline provider has no model'); },
  health: async () => ({ ok: true, detail: 'No AI model configured — the assistant produces clearly-labelled offline drafts from the book data.' }),
};

/** Chooses the configured provider once at startup (swap models with environment variables only). */
@Injectable()
export class AiProviderService {
  readonly provider: AiProvider;
  private healthCache: { at: number; value: { ok: boolean; detail: string } } | null = null;
  constructor() {
    const a = config.ai;
    this.provider = a.provider === 'anthropic' ? new AnthropicProvider(a.model, a.timeoutMs)
      : a.provider === 'openai-compatible' ? new OpenAiCompatibleProvider(a.baseUrl, a.model, a.apiKey, a.timeoutMs, a.embedModel)
        : offline;
  }
  get embeddingsEnabled() { return !!config.ai.embedModel && typeof this.provider.embed === 'function'; }
  async health() {
    if (!this.healthCache || Date.now() - this.healthCache.at > 60_000) this.healthCache = { at: Date.now(), value: await this.provider.health() };
    return this.healthCache.value;
  }
}
