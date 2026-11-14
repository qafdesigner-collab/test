import { AiProvider, AiUnavailableError, GenerateRequest, GenerateResult } from './types';

/**
 * Self-hosted open-weight models through the OpenAI-compatible HTTP API that Ollama, vLLM, LM Studio,
 * llama.cpp server and most hosted inference services expose (POST {base}/chat/completions, /embeddings).
 * Default and recommended for low marginal cost: e.g. Ollama + qwen2.5:7b-instruct on one GPU.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'openai-compatible';
  readonly live = true;
  constructor(private readonly baseUrl: string, readonly model: string, private readonly apiKey: string, private readonly timeoutMs: number, private readonly embedModel = '') {}

  private async post(path: string, body: unknown) {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      throw new AiUnavailableError(`The AI server at ${this.baseUrl} is not reachable (${e?.name === 'TimeoutError' ? 'timed out' : e?.message})`);
    }
    if (!res.ok) throw new AiUnavailableError(`The AI server answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json() as Promise<any>;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const j = await this.post('/chat/completions', {
      model: this.model, max_tokens: req.maxTokens, temperature: 0.4, stream: false,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
    });
    return {
      text: j.choices?.[0]?.message?.content ?? '', model: j.model ?? this.model,
      inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.embedModel) throw new AiUnavailableError('No embedding model configured');
    const j = await this.post('/embeddings', { model: this.embedModel, input: texts });
    return (j.data ?? []).sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding);
  }

  async health() {
    try {
      const res = await fetch(`${this.baseUrl}/models`, { signal: AbortSignal.timeout(5000), headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {} });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const j: any = await res.json();
      const ids: string[] = (j.data ?? []).map((m: any) => m.id);
      return { ok: ids.length === 0 || ids.includes(this.model), detail: ids.includes(this.model) ? `${this.model} is available` : `Model ${this.model} not found on the server (has: ${ids.slice(0, 5).join(', ') || 'none'})` };
    } catch (e: any) {
      return { ok: false, detail: `Not reachable: ${e?.message}` };
    }
  }
}
