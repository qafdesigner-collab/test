// Extracts text per page from a PDF. Runs as a separate, time-limited child process so a
// malformed or hostile PDF can never crash or hang the API. Output: JSON { pages: string[] } on stdout.
import { readFile } from 'fs/promises';
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const file = process.argv[2];
const maxPages = Number(process.argv[3] || 2000);
const data = new Uint8Array(await readFile(file));
const doc = await getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
const pages = [];
for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  let text = '';
  for (const item of tc.items) { if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' '); }
  pages.push(text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim());
  page.cleanup();
}
process.stdout.write(JSON.stringify({ numPages: doc.numPages, pages }));
await doc.destroy();
