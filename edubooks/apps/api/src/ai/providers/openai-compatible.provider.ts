import { AiProvider, AiUnavailableError, GenerateRequest, GenerateResult } from './types';

/**
 * Self-hosted open-weight models through the OpenAI-compatible HTTP API that Ollama, vLLM, LM Studio,
 * llama.cpp server and most hosted inference services expose (POST {base}/chat/completions, /embeddings).
 * Default and recommended for low marginal cost: e.g. Ollama + qwen2.5:7b-instruct on one GPU.
 */
/** The service's own error message, short. */
const said = (t: string) => { try { const j = JSON.parse(t); return String(j.error?.message ?? j.message ?? j.error ?? t).slice(0, 160); } catch { return t.slice(0, 160) || 'no details'; } };

export class OpenAiCompatibleProvider implements AiProvider {
  readonly live = true;
  constructor(private readonly baseUrl: string, readonly model: string, private readonly apiKey: string, private readonly timeoutMs: number, private readonly embedModel = '', readonly name = 'openai-compatible') {}

  private async post(path: string, body: any): Promise<any> {
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
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      // some services / free models do not support "JSON mode": ask again without it (the prompt asks for JSON anyway)
      if (res.status === 400 && body?.response_format && /response_format|json/i.test(text)) { const { response_format: _r, ...rest } = body; return this.post(path, rest); }
      throw new AiUnavailableError(res.status === 429 ? `${this.name} is busy or its free daily limit is used up — please try again later.`
        : res.status === 401 || (res.status === 400 && /api[ _-]?key/i.test(text)) ? `${this.name} did not accept the API key — check that you pasted the whole key for this service. (It said: ${said(text)})`
        : res.status === 403 ? `${this.name} refused access (403). The key may be fine: some services block requests from certain countries, networks or server hosts, or the key's project does not allow this model. (It said: ${said(text)})`
        : res.status === 404 && /model/i.test(text) ? `${this.name} does not know the model “${this.model}”. Make sure the right service card is selected, or press “Show available models” and pick one.` : `The AI server answered ${res.status}: ${text}`);
    }
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

  /** Models this key can use (for the "Show available models" list). */
  async models(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/models`, { signal: AbortSignal.timeout(10_000), headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {} });
    if (!res.ok) throw new AiUnavailableError(res.status === 401 || res.status === 403 ? `${this.name} did not accept the API key.` : `${this.name} answered ${res.status} when asked for its models.`);
    const j: any = await res.json();
    return (j.data ?? j.models ?? []).map((m: any) => String(m.id ?? m.name ?? '').replace(/^models\//, '')).filter(Boolean).sort();
  }

  async health() {
    try {
      const res = await fetch(`${this.baseUrl}/models`, { signal: AbortSignal.timeout(5000), headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {} });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const j: any = await res.json();
      const ids: string[] = (j.data ?? []).map((m: any) => m.id);
      const has = ids.some((id) => id === this.model || id.endsWith(`/${this.model}`));
      return { ok: ids.length === 0 || has, detail: has || !ids.length ? `${this.model} is available` : `Model ${this.model} not found on the server (has: ${ids.slice(0, 5).join(', ') || 'none'})` };
    } catch (e: any) {
      return { ok: false, detail: `Not reachable: ${e?.message}` };
    }
  }
}
