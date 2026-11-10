import Anthropic from '@anthropic-ai/sdk';
import { AiProvider, AiUnavailableError, GenerateRequest, GenerateResult } from './types';

/**
 * Optional hosted provider: Claude via the official Anthropic SDK (AI_PROVIDER=anthropic).
 * Credentials come from the environment (ANTHROPIC_API_KEY). Server-side refusal fallbacks are enabled.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly live = true;
  private readonly client: Anthropic;
  constructor(readonly model: string, timeoutMs: number) {
    this.client = new Anthropic({ timeout: timeoutMs, maxRetries: 2 });
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: Math.max(req.maxTokens, 16000),
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      });
      const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
      return { text, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, refused: response.stop_reason === 'refusal' };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AiUnavailableError('The Claude API key is missing or invalid (ANTHROPIC_API_KEY)');
      if (error instanceof Anthropic.RateLimitError) throw new AiUnavailableError('The AI service is busy (rate limited). Please try again in a minute.');
      if (error instanceof Anthropic.APIConnectionError) throw new AiUnavailableError('The AI service is not reachable');
      if (error instanceof Anthropic.APIError) throw new AiUnavailableError(`AI service error ${error.status}`);
      throw error;
    }
  }

  async health() {
    try { await this.client.models.retrieve(this.model); return { ok: true, detail: `${this.model} is available` }; } catch (e: any) { return { ok: false, detail: e?.message ?? 'unavailable' }; }
  }
}
