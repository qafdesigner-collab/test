import { execFile, spawnSync } from 'child_process';
import * as fs from 'fs';

/**
 * Makes uploaded PDFs smaller with Ghostscript (when the server has it): pictures are reduced to screen quality
 * (200 dpi), text stays real text, and the file is re-ordered for fast web viewing, so the first pages open
 * before the rest has arrived. Off with PDF_COMPRESS=0; another program path with GS_PATH.
 */
const GS = process.env.GS_PATH || 'gs';
let found: string | null | undefined;
export function ghostscript(): string | null {
  if (process.env.PDF_COMPRESS === '0') return null;
  if (found === undefined) {
    try { const r = spawnSync(GS, ['--version'], { timeout: 5000, encoding: 'utf8' }); found = r.status === 0 ? String(r.stdout).trim() : null; } catch { found = null; }
  }
  return found;
}

const DPI = Number(process.env.PDF_COMPRESS_DPI || 200);
/** Only one PDF is compressed at a time, so a big upload never slows the whole server. */
let queue: Promise<unknown> = Promise.resolve();

export function compressPdf(input: string, output: string): Promise<void> {
  const job = queue.then(() => new Promise<void>((ok, fail) => {
    execFile(GS, ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', '-dPDFSETTINGS=/ebook',
      '-dDetectDuplicateImages=true', '-dDownsampleColorImages=true', `-dColorImageResolution=${DPI}`, '-dDownsampleGrayImages=true',
      `-dGrayImageResolution=${DPI}`, '-dColorImageDownsampleThreshold=1.0', '-dGrayImageDownsampleThreshold=1.0', '-dDownsampleMonoImages=true', `-dMonoImageResolution=${Math.max(DPI, 300)}`, '-dFastWebView=true',
      `-sOutputFile=${output}`, input],
    { timeout: 45 * 60_000, maxBuffer: 64 * 1048576, env: { PATH: process.env.PATH } }, (err, _o, stderr) => {
      if (err) { fs.rmSync(output, { force: true }); return fail(new Error(err.killed ? 'PDF compression timed out' : `gs: ${(String(stderr).split('\n').find((l) => l.trim() && !/^(Page \d|Shared|First|Num|Greatest|Least)/.test(l)) || err.message).slice(0, 200)}`)); }
      ok();
    });
  }));
  queue = job.catch(() => undefined);
  return job;
}
