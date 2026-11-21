'use client';
/**
 * Reading aloud with the most natural voice available: the platform's own voice (Piper on the server) when the
 * publisher installed it for the text's language, otherwise the best voice of the device (its "Natural"/"Neural" voices first).
 */
let status: Promise<{ ready: boolean; langs: string[] }> | null = null;
const voiceStatus = () => (status ??= fetch('/api/voice/status', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : { ready: false, langs: [] })).catch(() => ({ ready: false, langs: [] })));

let current: HTMLAudioElement | null = null; let token = 0;
export function stopVoice() { token++; current?.pause(); current = null; try { window.speechSynthesis?.cancel(); } catch { /* none */ } }

function langOf(t: string): string {
  const ar = (t.match(/[؀-ۿ]/g) ?? []).length, hi = (t.match(/[ऀ-ॿ]/g) ?? []).length, la = (t.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  if (hi > la && hi >= ar) return 'hi';
  if (ar > la) return /[ٹڈڑںےۓھگکپچژ]/.test(t) ? 'ur' : 'ar';
  return / (le|la|les|est|une|des|et|avec|pour) /i.test(` ${t} `) && !/ (the|and|is|with) /i.test(` ${t} `) ? 'fr' : 'en';
}

/** The device voice that sounds most natural for a language. */
function bestDeviceVoice(lang: string) {
  const all = window.speechSynthesis?.getVoices?.() ?? [];
  const want = { en: 'en', ar: 'ar', hi: 'hi', ur: 'ur', fr: 'fr' }[lang] ?? 'en';
  const mine = all.filter((v) => v.lang.toLowerCase().startsWith(want));
  const score = (v: SpeechSynthesisVoice) => (/natural|neural/i.test(v.name) ? 4 : 0) + (/online|google|premium|enhanced/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
  return mine.sort((a, b) => score(b) - score(a))[0] ?? null;
}
function deviceSpeak(text: string, my: number) {
  return new Promise<void>((done) => {
    if (!window.speechSynthesis || my !== token) return done();
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')); const l = langOf(text);
    const v = bestDeviceVoice(l); if (v) { u.voice = v; u.lang = v.lang; } else if (l !== 'en') u.lang = l;
    u.rate = 0.9; u.onend = () => done(); u.onerror = () => done();
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  });
}
async function play(res: Response, my: number) {
  const url = URL.createObjectURL(await res.blob()); if (my !== token) return;
  await new Promise<void>((done) => {
    const a = new Audio(url); current = a;
    a.onended = () => { URL.revokeObjectURL(url); done(); }; a.onerror = () => done(); a.onpause = () => { if (a.currentTime < a.duration) done(); };
    a.play().catch(() => done());
  });
}

/** Reads a text aloud; resolves when it has finished (or was stopped). */
export async function speakText(text: string) {
  stopVoice(); const my = token;
  const s = await voiceStatus(); const l = langOf(text);
  if (s.ready && s.langs.includes(l)) {
    try {
      const r = await fetch('/api/voice/say', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 4000) }) });
      if (r.status === 200 || r.status === 201) return play(r, my);
    } catch { /* the device voice below */ }
  }
  return deviceSpeak(text, my);
}

/** Reads a page of a book aloud (the server reads the page's own words); `fallback` gives the text for the device voice. */
export async function speakPage(componentId: string, page: number, fallback: () => Promise<string>) {
  stopVoice(); const my = token;
  const s = await voiceStatus();
  if (s.ready) {
    try {
      const r = await fetch(`/api/voice/components/${componentId}/pages/${page}`, { credentials: 'same-origin' });
      if (r.status === 200) return play(r, my);
    } catch { /* the device voice below */ }
  }
  const t = await fallback(); if (!t.trim()) throw new Error('This page has no readable text');
  return deviceSpeak(t, my);
}
