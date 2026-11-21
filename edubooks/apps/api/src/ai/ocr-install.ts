import { execFile } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

/**
 * Installs OCR (Tesseract + Poppler) from inside the platform, without root and without the host's help:
 * the official micromamba package tool (checked against its published SHA-256) downloads Tesseract and Poppler
 * from conda-forge into the app's own "ocr" folder, then the chosen language packs are added. The folder stays
 * across platform updates. Linux servers only (as cPanel is).
 */
const BASE = process.env.OCR_INSTALL_BASE_URL; // tests only: a local server with stand-in files
export const LANG_NAMES: Record<string, string> = { eng: 'English', fra: 'French', deu: 'German', ara: 'Arabic', urd: 'Urdu', spa: 'Spanish', hin: 'Hindi', ita: 'Italian', tur: 'Turkish', fas: 'Persian' };

export function ocrHome() {
  if (process.env.OCR_HOME) return path.resolve(process.env.OCR_HOME);
  return process.env.EDUBOOKS_APP_ROOT ? path.join(process.env.EDUBOOKS_APP_ROOT, 'ocr') : path.resolve(config.storageDir, '..', 'ocr');
}
const envDir = () => path.join(ocrHome(), 'env');
/** The installed program, if the platform installed OCR itself. */
export function localBin(name: 'tesseract' | 'pdftoppm') { const p = path.join(envDir(), 'bin', name); return fs.existsSync(p) ? p : null; }
export function localTessdata() { const p = path.join(envDir(), 'share', 'tessdata'); return fs.existsSync(p) ? p : null; }

interface Status { state: 'idle' | 'running' | 'done' | 'failed'; step?: string; error?: string; startedAt?: string; finishedAt?: string; langs?: string[]; log?: string[] }
const statusFile = () => path.join(ocrHome(), 'status.json');
export function installStatus(): Status {
  try {
    const s = JSON.parse(fs.readFileSync(statusFile(), 'utf8')) as Status;
    // a run whose process ended (restart) more than 40 minutes ago is not running any more
    if (s.state === 'running' && s.startedAt && Date.now() - Date.parse(s.startedAt) > 40 * 60_000) return { ...s, state: 'failed', error: 'The installation stopped (the app was restarted). Please start it again.' };
    return s;
  } catch { return { state: 'idle' }; }
}
function save(s: Status) { fs.mkdirSync(ocrHome(), { recursive: true }); fs.writeFileSync(statusFile(), JSON.stringify(s, null, 1)); }

function platformName() {
  if (process.platform !== 'linux') return null;
  return process.arch === 'x64' ? 'linux-64' : process.arch === 'arm64' ? 'linux-aarch64' : null;
}

async function download(url: string, file: string) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}): ${url}`);
  const tmp = `${file}.part`;
  await fs.promises.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
  await fs.promises.rename(tmp, file);
}
function sh(cmd: string, args: string[], timeoutMs: number, env: Record<string, string>) {
  return new Promise<string>((ok, fail) => execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 32 * 1048576, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env } }, (e, out, err) => {
    if (e) return fail(new Error(e.killed ? `${path.basename(cmd)} took too long` : String(err || e.message).split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 400)));
    ok(String(out));
  }));
}

/** Starts the installation in the background (one at a time). */
export function startInstall(langs: string[], onDone?: () => void) {
  const plat = platformName();
  if (!plat) throw new Error(`Installing OCR from the platform works on Linux servers only (this server: ${process.platform}/${process.arch}).`);
  const cur = installStatus();
  if (cur.state === 'running') return cur;
  const wanted = [...new Set(['eng', ...langs.filter((l) => /^[a-z_]{3,8}$/.test(l))])];
  const st: Status = { state: 'running', step: 'Starting', startedAt: new Date().toISOString(), langs: wanted, log: [] };
  const step = (t: string) => { st.step = t; st.log = [...(st.log ?? []), `${new Date().toISOString().slice(11, 19)} ${t}`].slice(-40); save(st); };
  save(st);
  setImmediate(async () => {
    const home = ocrHome(); const mm = path.join(home, 'micromamba');
    try {
      step('Downloading the package tool (micromamba)');
      const mmUrl = BASE ? `${BASE}/micromamba-${plat}` : `https://github.com/mamba-org/micromamba-releases/releases/latest/download/micromamba-${plat}`;
      await download(mmUrl, mm);
      await download(`${mmUrl}.sha256`, `${mm}.sha256`);
      const want = fs.readFileSync(`${mm}.sha256`, 'utf8').trim().split(/\s+/)[0].toLowerCase();
      const got = createHash('sha256').update(fs.readFileSync(mm)).digest('hex');
      if (!/^[a-f0-9]{64}$/.test(want) || want !== got) throw new Error('The downloaded package tool did not match its published checksum, so it was not used.');
      fs.chmodSync(mm, 0o755);
      step('Installing Tesseract OCR and Poppler from conda-forge (this takes a few minutes)');
      fs.rmSync(envDir(), { recursive: true, force: true });
      await sh(mm, ['create', '-y', '-q', '-r', path.join(home, 'mamba'), '-p', envDir(), '-c', 'conda-forge', '--override-channels', 'tesseract', 'poppler'], 30 * 60_000,
        { MAMBA_ROOT_PREFIX: path.join(home, 'mamba'), HOME: home });
      if (!localBin('tesseract') || !localBin('pdftoppm')) throw new Error('Tesseract or Poppler was not found after installing.');
      const tessdata = path.join(envDir(), 'share', 'tessdata'); fs.mkdirSync(tessdata, { recursive: true });
      for (const l of wanted) {
        if (fs.existsSync(path.join(tessdata, `${l}.traineddata`))) continue;
        step(`Adding the ${LANG_NAMES[l] ?? l} language`);
        await download(BASE ? `${BASE}/tessdata/${l}.traineddata` : `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${l}.traineddata`, path.join(tessdata, `${l}.traineddata`));
      }
      step('Checking that OCR works');
      const langsOut = await sh(localBin('tesseract')!, ['--list-langs'], 60_000, { TESSDATA_PREFIX: tessdata });
      fs.rmSync(path.join(home, 'mamba', 'pkgs'), { recursive: true, force: true }); // downloaded packages are no longer needed
      Object.assign(st, { state: 'done', finishedAt: new Date().toISOString() });
      step(`Done — languages: ${langsOut.split('\n').slice(1).map((x) => x.trim()).filter((x) => x && x !== 'osd').map((x) => LANG_NAMES[x] ?? x).join(', ')}`);
      onDone?.();
    } catch (e: any) {
      Object.assign(st, { state: 'failed', error: String(e?.message ?? e).slice(0, 500), finishedAt: new Date().toISOString() }); step(`Failed: ${st.error}`);
    }
  });
  return st;
}

/** Removes the platform's own OCR installation. */
export function uninstall() { fs.rmSync(ocrHome(), { recursive: true, force: true }); }
