import { execFile, spawn } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

/**
 * Natural reading voice with Piper (open source, runs on the server without internet once installed).
 * Installed from inside the platform: the Piper program from its official GitHub release (checked against its SHA-256)
 * and the chosen voices from the official Piper voice collection (each file checked against its published MD5),
 * into the app's own "voice" folder, which stays across platform updates.
 */
const base = () => process.env.VOICE_INSTALL_BASE_URL; // tests only: a local server with stand-in files
const PIPER = { url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz', sha256: 'a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992' };
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';

export type Lang = 'en' | 'ar' | 'hi' | 'fr';
export const VOICES: Record<string, { lang: Lang; label: string; path: string; md5: string; jsonMd5: string; mb: number }> = {
  'en_US-lessac-medium': { lang: 'en', label: 'English (US) — Lessac, woman, clear', path: 'en/en_US/lessac/medium', md5: '2fc642b535197b6305c7c8f92dc8b24f', jsonMd5: 'c1f2b7bddefe113f3255ff9ef234cfd3', mb: 63 },
  'en_US-amy-medium': { lang: 'en', label: 'English (US) — Amy, woman, warm', path: 'en/en_US/amy/medium', md5: '778d28aeb95fcdf8a882344d9df142fc', jsonMd5: '7f37dadb26340c90ebc8088e0b252310', mb: 63 },
  'en_US-ryan-medium': { lang: 'en', label: 'English (US) — Ryan, man', path: 'en/en_US/ryan/medium', md5: '8f06d3aff8ded5a7f13f907e6bec32ac', jsonMd5: 'f173a2b5202b3e4128ccc3ed8195306c', mb: 63 },
  'en_GB-alba-medium': { lang: 'en', label: 'English (UK) — Alba, woman', path: 'en/en_GB/alba/medium', md5: 'c07f313752bb3aba8061041666251654', jsonMd5: 'dbb6f2ede31082710665221417906e13', mb: 63 },
  'ar_JO-kareem-medium': { lang: 'ar', label: 'Arabic — Kareem, man', path: 'ar/ar_JO/kareem/medium', md5: 'c0697df8a7fb180079cc5ac523f91a8e', jsonMd5: 'dd70b31eb5a395907241b1e5367ace3a', mb: 63 },
  'hi_IN-priyamvada-medium': { lang: 'hi', label: 'Hindi — Priyamvada, woman', path: 'hi/hi_IN/priyamvada/medium', md5: '7d5e20c2d1e72de8ed772f222e679626', jsonMd5: '599ca4dc5d421a9c66692433f618e080', mb: 64 },
  'hi_IN-pratham-medium': { lang: 'hi', label: 'Hindi — Pratham, man', path: 'hi/hi_IN/pratham/medium', md5: 'f1e5a629a9e533a7155910530109eb86', jsonMd5: 'ab655cdad90f1939f00d1b3aaf440e99', mb: 64 },
  'fr_FR-siwis-medium': { lang: 'fr', label: 'French — Siwis, woman', path: 'fr/fr_FR/siwis/medium', md5: '20e876e8c839e9b11a26085858f2300c', jsonMd5: 'a407e7e6901feb79c2ea2a5466076cce', mb: 63 },
};
export const LANG_LABELS: Record<Lang, string> = { en: 'English', ar: 'Arabic', hi: 'Hindi', fr: 'French' };

export function voiceHome() {
  if (process.env.VOICE_HOME) return path.resolve(process.env.VOICE_HOME);
  return process.env.EDUBOOKS_APP_ROOT ? path.join(process.env.EDUBOOKS_APP_ROOT, 'voice') : path.resolve(config.storageDir, '..', 'voice');
}
const voicesDir = () => path.join(voiceHome(), 'voices');
export const cacheDir = () => path.join(voiceHome(), 'cache');
const statusFile = () => path.join(voiceHome(), 'status.json');
const settingsFile = () => path.join(voiceHome(), 'settings.json');

/** How Piper is run: PIPER_CMD (e.g. "/opt/piper-venv/bin/python -m piper" on a VPS) or the program the platform installed. */
export function piperCommand(): string[] | null {
  if (process.env.PIPER_CMD) return process.env.PIPER_CMD.split(' ').filter(Boolean);
  const bin = path.join(voiceHome(), 'piper', 'piper');
  return fs.existsSync(bin) ? [bin] : null;
}
export function installedVoices() {
  return Object.keys(VOICES).filter((id) => fs.existsSync(path.join(voicesDir(), `${id}.onnx`)) && fs.existsSync(path.join(voicesDir(), `${id}.onnx.json`)));
}

export interface VoiceSettings { enabled: boolean; voices: Partial<Record<Lang, string>>; speed: number }
export function voiceSettings(): VoiceSettings {
  let s: Partial<VoiceSettings> = {};
  try { s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { /* defaults */ }
  const have = installedVoices();
  const voices: Partial<Record<Lang, string>> = {};
  for (const l of Object.keys(LANG_LABELS) as Lang[]) {
    const chosen = s.voices?.[l];
    voices[l] = chosen && have.includes(chosen) ? chosen : have.find((id) => VOICES[id].lang === l);
  }
  return { enabled: s.enabled ?? true, voices, speed: Math.min(1.5, Math.max(0.6, Number(s.speed) || 0.9)) };
}
export function saveVoiceSettings(v: Partial<VoiceSettings>) {
  const cur = voiceSettings(); fs.mkdirSync(voiceHome(), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...cur, ...v, voices: { ...cur.voices, ...(v.voices ?? {}) } }, null, 1));
  return voiceSettings();
}
/** Ready to speak: Piper and at least one voice, switched on. */
export function voiceReady() { const s = voiceSettings(); return s.enabled && !!piperCommand() && installedVoices().length > 0; }

/** The language of a text, from its letters (Urdu has no Piper voice yet: the device voice reads it). */
export function langOf(text: string): Lang | 'ur' {
  const t = text.slice(0, 2000);
  const arabicScript = (t.match(/[؀-ۿ]/g) ?? []).length; const deva = (t.match(/[ऀ-ॿ]/g) ?? []).length; const latin = (t.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  if (deva > latin && deva >= arabicScript) return 'hi';
  if (arabicScript > latin) return /[ٹڈڑںےۓھگکپچژ]/.test(t) ? 'ur' : 'ar';
  const words = t.toLowerCase().split(/[^a-zà-ÿ']+/);
  const fr = words.filter((w) => ['le', 'la', 'les', 'est', 'une', 'des', 'et', 'dans', 'je', 'il', 'elle', 'nous', 'avec', 'pour', 'sur'].includes(w)).length;
  const en = words.filter((w) => ['the', 'and', 'is', 'a', 'to', 'of', 'in', 'it', 'you', 'with', 'for', 'on', 'this'].includes(w)).length;
  return fr > en ? 'fr' : 'en';
}

function which(cmd: string) { return (process.env.PATH ?? '').split(':').map((d) => path.join(d, cmd)).find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }) ?? null; }

/** Speaks a text with the chosen voice for its language. Returns an audio file (MP3 when ffmpeg is there, else WAV), cached. */
export async function speak(text: string, lang?: Lang | 'ur'): Promise<{ file: string; mime: string } | null> {
  const cmd = piperCommand(); const s = voiceSettings();
  if (!cmd || !s.enabled) return null;
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ').replace(/[_*#|<>[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (!clean) return null;
  const l = lang ?? langOf(clean); if (l === 'ur') return null;
  const voice = s.voices[l]; if (!voice) return null;
  const key = createHash('sha256').update(`${voice}|${s.speed}|${clean}`).digest('hex');
  fs.mkdirSync(cacheDir(), { recursive: true });
  for (const [ext, mime] of [['mp3', 'audio/mpeg'], ['wav', 'audio/wav']] as const) { const f = path.join(cacheDir(), `${key}.${ext}`); if (fs.existsSync(f)) return { file: f, mime }; }
  const wav = path.join(cacheDir(), `${key}.tmp.wav`);
  await new Promise<void>((ok, fail) => {
    // the Python Piper (PIPER_CMD "python -m piper") spells options with dashes, the Piper program with underscores
    const py = cmd.includes('-m'); const opt = (o: string) => (py ? o.replace(/_/g, '-') : o);
    const p = spawn(cmd[0], [...cmd.slice(1), '--model', path.join(voicesDir(), `${voice}.onnx`), '--output_file', wav, opt('--length_scale'), String(1 / s.speed), opt('--sentence_silence'), '0.35'],
      { env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LD_LIBRARY_PATH: path.join(voiceHome(), 'piper') }, stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; const t = setTimeout(() => p.kill('SIGKILL'), 120_000);
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('error', (e) => { clearTimeout(t); fail(e); });
    p.on('close', (code) => { clearTimeout(t); code === 0 && fs.existsSync(wav) ? ok() : fail(new Error(`The voice could not be made${err ? `: ${err.split('\n').filter(Boolean).slice(-1)[0]}` : ''}`)); });
    p.stdin.end(clean);
  });
  const ff = which('ffmpeg');
  if (ff) {
    const mp3 = path.join(cacheDir(), `${key}.mp3`);
    const done = await new Promise<boolean>((ok) => execFile(ff, ['-nostdin', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '5', mp3], { timeout: 60_000 }, (e) => ok(!e)));
    if (done) { fs.rmSync(wav, { force: true }); return { file: mp3, mime: 'audio/mpeg' }; }
  }
  const out = path.join(cacheDir(), `${key}.wav`); fs.renameSync(wav, out);
  return { file: out, mime: 'audio/wav' };
}

// ---------- installing from the platform ----------
interface Status { state: 'idle' | 'running' | 'done' | 'failed'; step?: string; error?: string; startedAt?: string; finishedAt?: string; voices?: string[]; log?: string[] }
export function installStatus(): Status {
  try {
    const s = JSON.parse(fs.readFileSync(statusFile(), 'utf8')) as Status;
    if (s.state === 'running' && s.startedAt && Date.now() - Date.parse(s.startedAt) > 40 * 60_000) return { ...s, state: 'failed', error: 'The installation stopped (the app was restarted). Please start it again.' };
    return s;
  } catch { return { state: 'idle' }; }
}
function save(s: Status) { fs.mkdirSync(voiceHome(), { recursive: true }); fs.writeFileSync(statusFile(), JSON.stringify(s, null, 1)); }
async function download(url: string, file: string) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15 * 60_000) })
    .catch((e: any) => { throw new Error(`Could not download ${url}: ${e?.cause?.message ?? e?.message ?? e}`); });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`);
  const tmp = `${file}.part`; await fs.promises.writeFile(tmp, Buffer.from(await res.arrayBuffer())); await fs.promises.rename(tmp, file);
}
const hashOf = (file: string, algo: 'sha256' | 'md5') => createHash(algo).update(fs.readFileSync(file)).digest('hex');
function sh(cmd: string, args: string[], cwd: string) {
  return new Promise<void>((ok, fail) => execFile(cmd, args, { cwd, timeout: 10 * 60_000 }, (e, _o, err) => (e ? fail(new Error(String(err || e.message).slice(0, 300))) : ok())));
}

/** Installs Piper (if needed) and the chosen voices, in the background (one at a time). */
export function startInstall(voices: string[], onDone?: () => void) {
  if (!process.env.PIPER_CMD && !(process.platform === 'linux' && process.arch === 'x64')) throw new Error(`Installing the natural voice from the platform works on Linux (x64) servers only (this server: ${process.platform}/${process.arch}).`);
  const cur = installStatus(); if (cur.state === 'running') return cur;
  const wanted = [...new Set(voices.filter((v) => VOICES[v]))];
  if (!wanted.length) throw new Error('Choose at least one voice');
  const st: Status = { state: 'running', step: 'Starting', startedAt: new Date().toISOString(), voices: wanted, log: [] };
  const step = (t: string) => { st.step = t; st.log = [...(st.log ?? []), `${new Date().toISOString().slice(11, 19)} ${t}`].slice(-40); save(st); };
  save(st);
  setImmediate(async () => {
    const home = voiceHome(); const BASE = base();
    try {
      fs.mkdirSync(voicesDir(), { recursive: true });
      if (!piperCommand()) {
        step('Downloading Piper (about 26 MB)');
        const tgz = path.join(home, 'piper.tar.gz');
        await download(BASE ? `${BASE}/piper_linux_x86_64.tar.gz` : PIPER.url, tgz);
        if (!BASE && hashOf(tgz, 'sha256') !== PIPER.sha256) { fs.rmSync(tgz, { force: true }); throw new Error('The downloaded Piper program did not match its published checksum, so it was not used.'); }
        step('Unpacking Piper');
        await sh('tar', ['-xzf', tgz], home); fs.rmSync(tgz, { force: true });
        if (!piperCommand()) throw new Error('Piper was not found after unpacking.');
      }
      for (const id of wanted) {
        const v = VOICES[id]; const onnx = path.join(voicesDir(), `${id}.onnx`);
        if (fs.existsSync(onnx) && fs.existsSync(`${onnx}.json`)) continue;
        step(`Downloading the voice ${v.label} (about ${v.mb} MB)`);
        await download(BASE ? `${BASE}/voices/${id}.onnx` : `${HF}/${v.path}/${id}.onnx`, onnx);
        await download(BASE ? `${BASE}/voices/${id}.onnx.json` : `${HF}/${v.path}/${id}.onnx.json`, `${onnx}.json`);
        if (!BASE && (hashOf(onnx, 'md5') !== v.md5 || hashOf(`${onnx}.json`, 'md5') !== v.jsonMd5)) {
          fs.rmSync(onnx, { force: true }); fs.rmSync(`${onnx}.json`, { force: true });
          throw new Error(`The voice ${v.label} did not match its published checksum, so it was not used.`);
        }
      }
      step('Checking that the voice works');
      const first = wanted[0]; const r = await speak(VOICES[first].lang === 'en' ? 'Hello! Let us read together.' : VOICES[first].lang === 'ar' ? 'مرحبا! لنقرأ معا.' : VOICES[first].lang === 'hi' ? 'नमस्ते! चलो साथ में पढ़ें।' : 'Bonjour ! Lisons ensemble.', VOICES[first].lang);
      if (!r) throw new Error('The voice did not speak.');
      Object.assign(st, { state: 'done', finishedAt: new Date().toISOString() }); step(`Done — voices: ${installedVoices().map((id) => VOICES[id].label).join(', ')}`);
      onDone?.();
    } catch (e: any) {
      Object.assign(st, { state: 'failed', error: String(e?.message ?? e).slice(0, 500), finishedAt: new Date().toISOString() }); step(`Failed: ${st.error}`);
    }
  });
  return st;
}
export function removeVoice(id: string) { fs.rmSync(path.join(voicesDir(), `${id}.onnx`), { force: true }); fs.rmSync(path.join(voicesDir(), `${id}.onnx.json`), { force: true }); }
export function uninstall() { fs.rmSync(voiceHome(), { recursive: true, force: true }); }
