/** A file link from the API. Protected PDFs come encrypted, with a one-time key for the platform's own reader. */
export type FileLink = { url: string; enc?: { alg: 'AES-CTR'; key: string; iv: string } };

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Turns encrypted bytes back into the PDF, in memory only. */
export async function decryptPdf(data: ArrayBuffer, enc: NonNullable<FileLink['enc']>): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', b64(enc.key), { name: 'AES-CTR' }, false, ['decrypt']);
  return crypto.subtle.decrypt({ name: 'AES-CTR', counter: b64(enc.iv), length: 32 }, key, data);
}

/** Downloads a book PDF for viewing: decrypted when protected, plain otherwise. */
export async function fetchPdf(link: FileLink): Promise<ArrayBuffer> {
  const res = await fetch(link.url, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 403 ? 'This book can only be read inside the platform' : 'The book pages could not be loaded');
  const data = await res.arrayBuffer();
  return link.enc ? decryptPdf(data, link.enc) : data;
}

const FIRST = 512 * 1024; // the first part: enough for pdf.js to read the page list of a fast-web-view file
const CHUNK = 256 * 1024;

/** Decrypts a part of the file that starts at byte `start` (a multiple of 16) — AES-CTR counts in 16-byte blocks. */
async function decryptAt(data: ArrayBuffer, enc: NonNullable<FileLink['enc']>, start: number) {
  const iv = b64(enc.iv); const v = new DataView(iv.buffer);
  v.setUint32(12, (v.getUint32(12) + start / 16) >>> 0);
  const key = await crypto.subtle.importKey('raw', b64(enc.key), { name: 'AES-CTR' }, false, ['decrypt']);
  return crypto.subtle.decrypt({ name: 'AES-CTR', counter: iv, length: 32 }, key, data);
}

/**
 * Opens a PDF part by part: the first pages show after a small download and the rest of the file is fetched only
 * when those pages are looked at. Big books and teacher guides (hundreds of MB) open in seconds this way.
 * `refresh` gets a new link when the old one has expired (links last a few minutes).
 */
export async function openPdf(link: FileLink, refresh?: () => Promise<FileLink>): Promise<any> {
  const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  let cur = link;
  const get = async (begin: number, end: number) => { // [begin, end)
    const a = begin - (begin % 16);
    for (let attempt = 0; ; attempt++) {
      const l = cur;
      const res = await fetch(l.url, { credentials: 'include', cache: 'no-store', headers: { Range: `bytes=${a}-${end - 1}` } });
      if ([401, 403, 404, 410].includes(res.status) && refresh && attempt < 2) { cur = await refresh(); continue; }
      if (!res.ok) throw new Error(res.status === 403 ? 'This book can only be read inside the platform' : 'The book pages could not be loaded');
      const whole = res.status === 200; // the server sent the whole file
      let data = await res.arrayBuffer();
      if (l.enc) data = await decryptAt(data, l.enc, whole ? 0 : a);
      const total = whole ? data.byteLength : Number(/\/(\d+)$/.exec(res.headers.get('Content-Range') ?? '')?.[1] ?? 0);
      return { data: whole ? data : data.slice(begin - a), whole, total };
    }
  };
  const first = await get(0, FIRST);
  if (first.whole || !first.total || first.total <= first.data.byteLength) {
    return pdfjs.getDocument({ data: new Uint8Array(first.data), isEvalSupported: false }).promise;
  }
  const transport = new pdfjs.PDFDataRangeTransport(first.total, new Uint8Array(first.data));
  transport.requestDataRange = (begin: number, end: number) => {
    get(begin, end).then((r) => transport.onDataRange(begin, new Uint8Array(r.whole ? r.data.slice(begin, end) : r.data)))
      .catch(() => undefined); // pdf.js shows the page as not loaded
  };
  return pdfjs.getDocument({ range: transport, length: first.total, rangeChunkSize: CHUNK, disableAutoFetch: true, disableStream: true, isEvalSupported: false }).promise;
}
