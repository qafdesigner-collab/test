// Copies the pdf.js worker into /public so the reader can load it as a static, same-origin file.
import { copyFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const dir = dirname(require.resolve('pdfjs-dist/package.json'));
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
copyFileSync(join(dir, 'build', 'pdf.worker.min.mjs'), new URL('../public/pdf.worker.min.mjs', import.meta.url));
