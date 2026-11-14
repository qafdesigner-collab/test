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
