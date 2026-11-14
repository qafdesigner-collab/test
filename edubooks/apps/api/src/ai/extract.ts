import { execFile } from 'child_process';
import * as path from 'path';

const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'extract-pdf-text.mjs');

/**
 * Extract text per page in a separate Node process with a memory cap and a hard timeout,
 * so malformed or hostile PDFs cannot crash or stall the API process.
 */
export function extractPdfPages(file: string, opts: { timeoutMs?: number; maxPages?: number } = {}): Promise<{ numPages: number; pages: string[] }> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--max-old-space-size=768', SCRIPT, file, String(opts.maxPages ?? 2000)],
      { timeout: opts.timeoutMs ?? 180_000, maxBuffer: 256 * 1024 * 1024, cwd: path.dirname(SCRIPT) },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(err.killed ? 'Text extraction timed out' : `Could not read the PDF: ${(stderr || err.message).split('\n')[0].slice(0, 200)}`));
        // Tolerate stray text before the JSON (older scripts / third-party warnings).
        try { resolve(JSON.parse(stdout.slice(Math.max(0, stdout.indexOf('{"numPages"'))))); } catch { reject(new Error('Text extraction produced unreadable output')); }
      });
  });
}
