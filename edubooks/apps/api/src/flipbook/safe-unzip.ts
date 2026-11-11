import * as fs from 'fs';
import * as path from 'path';

export interface UnzipLimits { maxFiles: number; maxBytes: number; allow: (name: string) => boolean }
export interface UnzipResult { files: { path: string; size: number }[]; skipped: number }

/**
 * Extracts a zip into `dest`, refusing anything that could escape the folder (absolute paths, "..",
 * symlinks), enforcing file-count and total-size limits, and skipping file types that are not allowed.
 */
export function safeUnzip(zipFile: string, dest: string, limits: UnzipLimits): Promise<UnzipResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yauzl = require('yauzl');
  const root = path.resolve(dest);
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true, validateEntrySizes: true, decodeStrings: true }, (err: Error | null, zip: any) => {
      if (err || !zip) return reject(new Error('This is not a valid zip file.'));
      const files: UnzipResult['files'] = []; let skipped = 0; let total = 0; let done = false;
      const fail = (e: Error) => { if (!done) { done = true; zip.close(); reject(e); } };
      zip.on('error', fail);
      zip.on('end', () => { if (!done) { done = true; resolve({ files, skipped }); } });
      zip.on('entry', (e: any) => {
        const name = String(e.fileName).replace(/\\/g, '/');
        const parts = name.split('/').filter(Boolean);
        if (name.startsWith('/') || /^[a-zA-Z]:/.test(name) || parts.includes('..')) return fail(new Error(`Unsafe path in the zip: ${name}`));
        if (name.endsWith('/')) return zip.readEntry();
        const type = (e.externalFileAttributes >>> 16) & 0o170000;
        if (type === 0o120000 || parts.some((p) => p === '__MACOSX' || p.startsWith('.')) || !limits.allow(name)) { skipped++; return zip.readEntry(); }
        if (files.length + 1 > limits.maxFiles) return fail(new Error(`The zip has more than ${limits.maxFiles} files.`));
        total += e.uncompressedSize;
        if (total > limits.maxBytes) return fail(new Error(`The unpacked flipbook is larger than ${Math.round(limits.maxBytes / 1048576)} MB.`));
        const out = path.resolve(root, ...parts);
        if (!out.startsWith(root + path.sep)) return fail(new Error(`Unsafe path in the zip: ${name}`));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        zip.openReadStream(e, (er: Error | null, rs: any) => {
          if (er) return fail(er);
          const ws = fs.createWriteStream(out, { mode: 0o600 });
          rs.on('error', fail); ws.on('error', fail);
          ws.on('close', () => { files.push({ path: parts.join('/'), size: e.uncompressedSize }); zip.readEntry(); });
          rs.pipe(ws);
        });
      });
      zip.readEntry();
    });
  });
}
