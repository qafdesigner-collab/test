'use client';
import { api } from '@/lib/api';

/**
 * Sends a big file in 8 MB pieces (3 at a time). A failed piece is tried again (up to 6 times, waiting longer each
 * time); choosing the same file again after an interruption continues where it stopped. Returns the upload id.
 */
export async function uploadBig(file: File, onProgress?: (p: { pct: number; sent: number; total: number; secondsLeft: number | null }) => void) {
  const st = await api.post<{ id: string; chunkSize: number; pieces: number; received: number[] }>('/uploads', { name: file.name, size: file.size, key: `${file.name}|${file.size}|${file.lastModified}` });
  const done = new Set(st.received); const todo = Array.from({ length: st.pieces }, (_, i) => i).filter((i) => !done.has(i));
  const started = Date.now(); const startBytes = done.size * st.chunkSize; let sent = Math.min(file.size, startBytes);
  const report = () => {
    const rate = (sent - startBytes) / Math.max(1, (Date.now() - started) / 1000);
    onProgress?.({ pct: Math.floor((sent / file.size) * 100), sent, total: file.size, secondsLeft: rate > 0 ? Math.round((file.size - sent) / rate) : null });
  };
  report();
  const one = async (i: number) => {
    const body = file.slice(i * st.chunkSize, Math.min(file.size, (i + 1) * st.chunkSize));
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await fetch(`/api/uploads/${st.id}/${i}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body });
        if (r.ok) break;
        if (r.status === 401 || r.status === 403 || r.status === 404) throw Object.assign(new Error((await r.json().catch(() => ({})))?.message || 'The upload was stopped'), { fatal: true });
        throw new Error(`Piece ${i + 1} was not accepted (${r.status})`);
      } catch (e: any) {
        if (e.fatal || attempt >= 6) throw e;
        await new Promise((ok) => setTimeout(ok, Math.min(30_000, 1500 * 2 ** (attempt - 1)))); // network hiccup: wait, then send it again
      }
    }
    sent += body.size; report();
  };
  const queue = [...todo];
  await Promise.all(Array.from({ length: 3 }, async () => { for (let i = queue.shift(); i !== undefined; i = queue.shift()) await one(i); }));
  return st.id;
}

export const fmtDuration = (s: number | null) => (s === null ? '' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);
