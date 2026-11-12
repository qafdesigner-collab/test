// Upload allow-list. The extension must be allowed AND the file's first bytes (magic number)
// must match, so a renamed .exe can never be stored as a "PDF".
type Sniff = (h: Buffer) => boolean;
const starts = (sig: number[], off = 0): Sniff => (h) => sig.every((b, i) => h[off + i] === b);
const ascii = (s: string, off = 0): Sniff => (h) => h.subarray(off, off + s.length).toString('latin1') === s;
const isText: Sniff = (h) => !h.includes(0) && !(h[0] === 0x4d && h[1] === 0x5a);
const zip = starts([0x50, 0x4b, 0x03, 0x04]);
const ole = starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export interface FileKind { mime: string; resourceType: string; sniff: Sniff; active?: boolean }
export const FILE_TYPES: Record<string, FileKind> = {
  pdf: { mime: 'application/pdf', resourceType: 'PDF', sniff: ascii('%PDF-') },
  ppt: { mime: 'application/vnd.ms-powerpoint', resourceType: 'PRESENTATION', sniff: ole },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', resourceType: 'PRESENTATION', sniff: zip },
  ppsx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow', resourceType: 'PRESENTATION', sniff: zip },
  doc: { mime: 'application/msword', resourceType: 'DOCUMENT', sniff: ole },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', resourceType: 'DOCUMENT', sniff: zip },
  xls: { mime: 'application/vnd.ms-excel', resourceType: 'SPREADSHEET', sniff: ole },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', resourceType: 'SPREADSHEET', sniff: zip },
  html: { mime: 'text/html', resourceType: 'HTML5', sniff: isText, active: true },
  htm: { mime: 'text/html', resourceType: 'HTML5', sniff: isText, active: true },
  zip: { mime: 'application/zip', resourceType: 'HTML5', sniff: zip },
  png: { mime: 'image/png', resourceType: 'IMAGE', sniff: starts([0x89, 0x50, 0x4e, 0x47]) },
  jpg: { mime: 'image/jpeg', resourceType: 'IMAGE', sniff: starts([0xff, 0xd8, 0xff]) },
  jpeg: { mime: 'image/jpeg', resourceType: 'IMAGE', sniff: starts([0xff, 0xd8, 0xff]) },
  gif: { mime: 'image/gif', resourceType: 'IMAGE', sniff: ascii('GIF8') },
  webp: { mime: 'image/webp', resourceType: 'IMAGE', sniff: (h) => ascii('RIFF')(h) && ascii('WEBP', 8)(h) },
  svg: { mime: 'image/svg+xml', resourceType: 'IMAGE', sniff: (h) => isText(h) && /<svg/i.test(h.toString('utf8')), active: true },
  mp3: { mime: 'audio/mpeg', resourceType: 'AUDIO', sniff: (h) => ascii('ID3')(h) || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) },
  wav: { mime: 'audio/wav', resourceType: 'AUDIO', sniff: (h) => ascii('RIFF')(h) && ascii('WAVE', 8)(h) },
  m4a: { mime: 'audio/mp4', resourceType: 'AUDIO', sniff: ascii('ftyp', 4) },
  mp4: { mime: 'video/mp4', resourceType: 'VIDEO', sniff: ascii('ftyp', 4) },
  webm: { mime: 'video/webm', resourceType: 'VIDEO', sniff: starts([0x1a, 0x45, 0xdf, 0xa3]) },
  txt: { mime: 'text/plain', resourceType: 'OTHER', sniff: isText },
};
export const extOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] ?? '');
