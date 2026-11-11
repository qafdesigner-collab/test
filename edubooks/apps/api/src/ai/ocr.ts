import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../config';

function run(cmd: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024, env: { PATH: process.env.PATH, OMP_THREAD_LIMIT: '1' } }, (err, stdout, stderr) => {
      if (err) return reject(new Error(err.killed ? `${cmd} timed out` : `${cmd}: ${(stderr || err.message).split('\n')[0].slice(0, 200)}`));
      resolve(stdout);
    });
  });
}

let available: Promise<{ ok: boolean; langs: string }> | undefined;
/** Detects pdftoppm + tesseract and keeps only the configured languages that are installed. */
export function ocrAvailable() {
  if (config.ocr.mode === '0') return Promise.resolve({ ok: false, langs: '' });
  available ??= (async () => {
    try {
      await run('pdftoppm', ['-v'], 5000).catch((e) => { if (/ENOENT/.test(e.message)) throw e; return ''; });
      const installed = (await run('tesseract', ['--list-langs'], 5000)).split('\n').slice(1).map((l) => l.trim());
      const langs = config.ocr.langs.split('+').filter((l) => installed.includes(l)).join('+');
      return { ok: !!langs, langs };
    } catch { return { ok: false, langs: '' }; }
  })();
  return available;
}

/**
 * OCR selected 1-based pages of a PDF. Each page is rasterised (pdftoppm) and recognised (tesseract)
 * in its own time-limited child process; temp images are deleted. Failed pages come back as ''.
 */
export async function ocrPages(file: string, pageNumbers: number[], onProgress?: (done: number) => void): Promise<Map<number, string>> {
  const { ok, langs } = await ocrAvailable();
  const out = new Map<number, string>();
  if (!ok) return out;
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ocr-'));
  const queue = pageNumbers.slice(0, config.ocr.maxPages);
  let done = 0;
  try {
    const worker = async () => {
      for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
        const prefix = path.join(dir, `p${n}`);
        try {
          await run('pdftoppm', ['-f', String(n), '-l', String(n), '-r', String(config.ocr.dpi), '-gray', '-png', '-singlefile', file, prefix], config.ocr.pageTimeoutMs);
          const text = await run('tesseract', [`${prefix}.png`, 'stdout', '-l', langs, '--psm', '3'], config.ocr.pageTimeoutMs);
          out.set(n, text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
        } catch { out.set(n, ''); }
        finally { fs.promises.rm(`${prefix}.png`, { force: true }).catch(() => undefined); onProgress?.(++done); }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, config.ocr.concurrency) }, worker));
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  return out;
}
