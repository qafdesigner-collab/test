import { AiProvider, AiUnavailableError, GenerateRequest, GenerateResult } from './types';

/** When a service last failed (so it is skipped for a while instead of making every teacher wait for it). */
const downSince = new Map<string, number>();
const PAUSE_MS = 2 * 60_000;
const key = (p: AiProvider) => `${p.name}|${p.model}`;

/**
 * The main AI with backups: each request goes to the first service that answers. A service that is down
 * (e.g. Ollama on a computer that is switched off, or a free plan whose daily limit is used up) is skipped for
 * two minutes, then tried again. Only "cannot answer" errors move on to the next service.
 */
export class FallbackProvider implements AiProvider {
  readonly live = true;
  constructor(private readonly chain: AiProvider[]) {}
  get name() { return this.chain[0].name; }
  get model() { return this.chain[0].model; }
  get names() { return this.chain.map((p) => `${p.name} · ${p.model}`); }

  async generate(req: GenerateRequest): Promise<GenerateResult & { via?: string }> {
    let last: Error | null = null;
    const now = Date.now();
    // services not paused first; paused ones only if all others failed
    const order = [...this.chain.filter((p) => !(now - (downSince.get(key(p)) ?? 0) < PAUSE_MS)), ...this.chain.filter((p) => now - (downSince.get(key(p)) ?? 0) < PAUSE_MS)];
    for (const p of order) {
      try {
        const r = await p.generate(req);
        downSince.delete(key(p));
        return p === this.chain[0] ? r : { ...r, via: `${p.name} · ${r.model}` };
      } catch (e: any) {
        if (!(e instanceof AiUnavailableError)) throw e;
        downSince.set(key(p), Date.now()); last = e;
      }
    }
    throw new AiUnavailableError(`No AI service answered. ${last?.message ?? ''}`.trim());
  }

  async health() {
    const results: string[] = [];
    for (const [i, p] of this.chain.entries()) {
      const h = await p.health().catch((e) => ({ ok: false, detail: String(e?.message ?? e) }));
      if (h.ok) return { ok: true, detail: i === 0 ? h.detail : `${this.chain[0].name} is not answering — using the backup ${p.name} · ${p.model}` };
      results.push(`${p.name}: ${h.detail}`);
    }
    return { ok: false, detail: results.join(' · ') };
  }
}
/** Tests only. */
export function resetFallbackPauses() { downSince.clear(); }
