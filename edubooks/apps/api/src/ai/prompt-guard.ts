/**
 * Llama Prompt Guard 2 (and similar classifiers) through an OpenAI-compatible chat endpoint, e.g. Groq's
 * meta-llama/llama-prompt-guard-2-86m. The answer is a score from 0 (normal) to 1 (prompt attack / jailbreak);
 * some services answer with a label instead (BENIGN / MALICIOUS), which is mapped to 0 / 1.
 */
export async function promptGuardScore(o: { baseUrl: string; model: string; apiKey: string }, text: string, timeoutMs = 8000): Promise<number> {
  const res = await fetch(`${o.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}) },
    body: JSON.stringify({ model: o.model, messages: [{ role: 'user', content: text.slice(0, 2000) }] }),
  });
  if (!res.ok) {
    const t = (await res.text()).slice(0, 200);
    throw new Error(res.status === 401 || res.status === 403 || /api[ _-]?key/i.test(t) ? 'The safety-check service did not accept the API key.' : `The safety-check service answered ${res.status}: ${t}`);
  }
  const j: any = await res.json();
  const out = String(j.choices?.[0]?.message?.content ?? '').trim();
  const n = Number.parseFloat(out);
  if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
  if (/malicious|injection|jailbreak|unsafe/i.test(out)) return 1;
  if (/benign|safe/i.test(out)) return 0;
  throw new Error(`Unexpected answer from the safety check: ${out.slice(0, 60)}`);
}
