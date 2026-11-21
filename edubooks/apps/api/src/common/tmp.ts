import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Private working folder for uploads and unpacking. On single-folder installs (cPanel) it lives inside the
 * app (edubooks-app/tmp), never in a shared /tmp that other accounts could own or fill; elsewhere it is a
 * per-user folder in the system temp directory.
 */
export function appTmp(sub = '') {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'u';
  const base = process.env.EDUBOOKS_APP_ROOT ? path.join(process.env.EDUBOOKS_APP_ROOT, 'tmp') : path.join(os.tmpdir(), `edubooks-${uid}`);
  const dir = sub ? path.join(base, sub) : base;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
