/* Atelier Perfume ERP · Barcodes drawn as SVG: EAN-13 for valid 13-digit numbers, Code 128 for everything else. */
'use strict';

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

const CODE128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];

/** True when the value is 13 digits with a correct EAN check digit. */
function isEan13(value) {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((a, d, i) => a + d * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/** Module string (1 = bar, 0 = space) for an EAN-13 number. */
function ean13Modules(value) {
  const d = value.split('').map(Number);
  const parity = EAN_PARITY[d[0]];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += EAN_R[d[i]];
  return bits + '101';
}

/** Module string for Code 128: code set C for even-length digit strings, otherwise set B (printable ASCII). */
function code128Modules(value) {
  const numeric = /^\d+$/.test(value) && value.length % 2 === 0 && value.length >= 4;
  const codes = numeric ? [105, ...value.match(/\d\d/g).map(Number)] : [104, ...[...value].map(c => Math.min(95, Math.max(0, c.charCodeAt(0) - 32)))];
  const check = codes.reduce((sum, code, i) => sum + code * (i || 1), 0) % 103;
  return [...codes, check, 106]
    .map(code => CODE128[code].split('').map((w, i) => (i % 2 ? '0' : '1').repeat(Number(w))).join(''))
    .join('');
}

/** SVG barcode with the human-readable number underneath. Width is in modules; scale it with CSS. */
function barcodeSvg(value, { height = 40, text = true } = {}) {
  const v = String(value || '').trim();
  if (!v) return '';
  const ean = isEan13(v);
  const bits = ean ? ean13Modules(v) : code128Modules(v.replace(/[^\x20-\x7e]/g, ''));
  const quiet = ean ? 11 : 10;
  const width = bits.length + quiet * 2;
  let rects = '';
  for (let i = 0; i < bits.length; ) {
    if (bits[i] !== '1') {
      i++;
      continue;
    }
    let run = 1;
    while (bits[i + run] === '1') run++;
    rects += `<rect x="${i + quiet}" y="0" width="${run}" height="${height}"/>`;
    i += run;
  }
  const label = text ? `<text x="${width / 2}" y="${height + 9}" text-anchor="middle" font-size="9" font-family="ui-monospace, Menlo, Consolas, monospace">${esc(v)}</text>` : '';
  return `<svg class="barcode" viewBox="0 0 ${width} ${height + (text ? 11 : 0)}" preserveAspectRatio="none" role="img" aria-label="Barcode ${esc(v)}" shape-rendering="crispEdges"><rect width="${width}" height="${height + (text ? 11 : 0)}" fill="#fff"/><g fill="#000">${rects}</g>${label}</svg>`;
}
