'use client';
import { decryptPdf, type FileLink } from '@/lib/protected-pdf';
import { api } from '@/lib/api';

/**
 * Books saved on this device for offline reading. The PDFs live in the "kg-books" cache; the service worker
 * (public/sw.js) wipes it on sign-out, so a shared tablet never keeps one child's books for the next.
 */
const BOOKS = 'kg-books';
const pdfKey = (componentId: string) => `/offline/pdf/${componentId}`;
const markKey = (editionId: string) => `/offline/edition/${editionId}`;
export const offlineSupported = () => typeof window !== 'undefined' && 'caches' in window && 'serviceWorker' in navigator;

export function registerServiceWorker() {
  if (!offlineSupported()) return;
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

export async function savedEditionIds(): Promise<string[]> {
  if (!offlineSupported()) return [];
  const c = await caches.open(BOOKS);
  return (await c.keys()).map((r) => new URL(r.url).pathname).filter((p) => p.startsWith('/offline/edition/')).map((p) => p.split('/').pop()!);
}

export async function isSaved(editionId: string) { return (await savedEditionIds()).includes(editionId); }

/** Downloads every part with pages, plus the book's contents list, so the reader works without internet. */
export async function saveBook(editionId: string, onProgress?: (done: number, total: number) => void) {
  const c = await caches.open(BOOKS);
  const ed = await api.get<any>(`/reader/editions/${editionId}`); // the service worker also keeps this answer for offline use
  const parts = (ed.components as any[]).filter((x) => x.hasPdf);
  let done = 0; onProgress?.(0, parts.length);
  for (const p of parts) {
    const link = await api.get<FileLink>(`/reader/components/${p.id}/pdf`);
    const res = await fetch(link.url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Could not download ${p.title}`);
    // Protected books stay encrypted on the device; the key is kept beside them and only used by the reader.
    const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
    if (link.enc) { headers['x-kg-key'] = link.enc.key; headers['x-kg-iv'] = link.enc.iv; }
    await c.put(pdfKey(p.id), new Response(await res.blob(), { headers }));
    onProgress?.(++done, parts.length);
  }
  await warmPages([`/read/${editionId}`]).catch(() => undefined);
  await c.put(markKey(editionId), new Response(JSON.stringify({ title: ed.title, parts: parts.map((x) => x.id), savedAt: new Date().toISOString() }), { headers: { 'content-type': 'application/json' } }));
  return parts.length;
}

/**
 * Keeps app pages (and the code they need) on the device so they open offline, e.g. the reader for a saved book.
 * The service worker stores the code files as they are fetched; the page itself goes into its pages cache.
 */
export async function warmPages(paths: string[]) {
  if (!offlineSupported()) return;
  const pages = await caches.open('kg-pages');
  // the small answers every page needs (who is signed in, branding); the service worker keeps them for offline use
  await import('pdfjs-dist').catch(() => undefined); // the PDF viewer's code is loaded on demand: fetch it now so it is kept too
  await Promise.all(['/api/auth/me', '/api/branding', '/api/company/my-protection', '/api/library', '/api/student/home', '/api/student/achievements', '/api/timetable/me']
    .map((u) => fetch(u, { credentials: 'include' }).catch(() => undefined)));
  try { const b = await (await fetch('/api/branding')).json(); await Promise.all([b.logoUrl, b.appIcon].filter(Boolean).map((u: string) => fetch(u).catch(() => undefined))); } catch { /* ignore */ }
  for (const p of paths) {
    try {
      const res = await fetch(p, { credentials: 'include' });
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) continue;
      const html = await res.clone().text(); await pages.put(new Request(new URL(p, location.origin).href), res);
      const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) ?? [])];
      await Promise.all(assets.map((a) => fetch(a).catch(() => undefined)));
    } catch { /* offline or not allowed: skip */ }
  }
}

export async function removeBook(editionId: string) {
  const c = await caches.open(BOOKS);
  const mark = await c.match(markKey(editionId));
  const parts: string[] = mark ? (await mark.json()).parts ?? [] : [];
  await Promise.all([...parts.map((id) => c.delete(pdfKey(id))), c.delete(markKey(editionId))]);
}

export async function offlinePdf(componentId: string): Promise<ArrayBuffer | null> {
  if (!offlineSupported()) return null;
  const hit = await (await caches.open(BOOKS)).match(pdfKey(componentId));
  if (!hit) return null;
  const key = hit.headers.get('x-kg-key'); const iv = hit.headers.get('x-kg-iv');
  const data = await hit.arrayBuffer();
  return key && iv ? decryptPdf(data, { alg: 'AES-CTR', key, iv }) : data;
}
