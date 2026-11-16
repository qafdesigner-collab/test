'use client';
/**
 * Shows PowerPoint (.pptx) and Word (.docx) files inside the platform, without downloading them and without any
 * outside service. The file is unpacked in the browser (it is a zip of XML parts) and drawn as HTML:
 *  - slides: positioned text boxes, pictures and slide colours (a simplified preview: no animations or charts);
 *  - documents: headings, paragraphs (bold / italic / underline), lists, tables and pictures.
 */

// ------------------------------------------------------------------ zip (central directory + browser deflate)
async function unzip(buf: ArrayBuffer) {
  const v = new DataView(buf); const u8 = new Uint8Array(buf); const files = new Map<string, () => Promise<Uint8Array>>();
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This file is damaged or not an Office file');
  const count = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true); const csize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true); const extraLen = v.getUint16(p + 30, true); const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true); const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    files.set(name, async () => {
      const ln = v.getUint16(local + 26, true); const le = v.getUint16(local + 28, true);
      const data = u8.subarray(local + 30 + ln + le, local + 30 + ln + le + csize);
      if (method === 0) return data;
      const ds = new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
      return new Uint8Array(await ds.arrayBuffer());
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el: Element | Document, local: string) => Array.from(el.getElementsByTagNameNS('*', local));
const child = (el: Element, local: string) => Array.from(el.children).find((c) => c.localName === local) ?? null;
const path = (base: string, target: string) => { // resolve "../media/image1.png" against "ppt/slides/slide1.xml"
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
};
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' };

async function rels(files: Map<string, () => Promise<Uint8Array>>, part: string) {
  const relPath = part.replace(/([^/]+)$/, '_rels/$1.rels'); const out = new Map<string, string>();
  const f = files.get(relPath); if (!f) return out;
  for (const r of kids(xml(new TextDecoder().decode(await f())), 'Relationship')) out.set(r.getAttribute('Id')!, path(part, r.getAttribute('Target') ?? ''));
  return out;
}
async function imageUrl(files: Map<string, () => Promise<Uint8Array>>, name: string, urls: string[]) {
  const f = files.get(name); const ext = name.split('.').pop()!.toLowerCase();
  if (!f || !MIME[ext]) return null; // e.g. .emf / .wmf drawings cannot be shown in a browser
  const u = URL.createObjectURL(new Blob([(await f()) as BlobPart], { type: MIME[ext] })); urls.push(u); return u;
}
const color = (el: Element | null) => { const c = el && kids(el, 'srgbClr')[0]; return c ? `#${c.getAttribute('val')}` : null; };

// ------------------------------------------------------------------ PowerPoint
function runsHtml(p: Element, slideWidthPt: number) {
  let html = '';
  for (const r of Array.from(p.children)) {
    if (r.localName === 'br') { html += '<br>'; continue; }
    if (r.localName !== 'r' && r.localName !== 'fld') continue;
    const t = child(r, 't')?.textContent ?? ''; const pr = child(r, 'rPr');
    const st: string[] = [];
    if (pr?.getAttribute('sz')) st.push(`font-size:${((Number(pr.getAttribute('sz')) / 100) / slideWidthPt) * 100}cqw`); // points → share of the slide width
    if (pr?.getAttribute('b') === '1') st.push('font-weight:700');
    if (pr?.getAttribute('i') === '1') st.push('font-style:italic');
    if (pr?.getAttribute('u') && pr.getAttribute('u') !== 'none') st.push('text-decoration:underline');
    const c = pr && color(child(pr, 'solidFill')); if (c) st.push(`color:${c}`);
    html += `<span style="${st.join(';')}">${esc(t)}</span>`;
  }
  return html;
}

export async function renderPptx(buf: ArrayBuffer) {
  const files = await unzip(buf); const urls: string[] = []; const td = new TextDecoder();
  const text = async (n: string) => { const f = files.get(n); return f ? td.decode(await f()) : null; };
  const pres = await text('ppt/presentation.xml'); if (!pres) throw new Error('This is not a PowerPoint (.pptx) file');
  const pd = xml(pres); const sz = kids(pd, 'sldSz')[0];
  const W = Number(sz?.getAttribute('cx') ?? 12192000); const H = Number(sz?.getAttribute('cy') ?? 6858000);
  const prel = await rels(files, 'ppt/presentation.xml');
  const order = kids(pd, 'sldId').map((s) => prel.get(s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? s.getAttribute('r:id') ?? '')).filter(Boolean) as string[];
  const slides: string[] = [];
  for (const [i, part] of order.entries()) {
    const sx = await text(part); if (!sx) continue;
    const d = xml(sx); const rel = await rels(files, part);
    const bg = color(kids(d, 'bg')[0] ?? null) ?? '#ffffff';
    let body = '';
    const box = (el: Element) => {
      const x = kids(el, 'off')[0]; const e = kids(el, 'ext')[0];
      if (!x || !e) return null;
      return { l: (Number(x.getAttribute('x')) / W) * 100, t: (Number(x.getAttribute('y')) / H) * 100, w: (Number(e.getAttribute('cx')) / W) * 100, h: (Number(e.getAttribute('cy')) / H) * 100 };
    };
    const tree = kids(d, 'spTree')[0];
    const shapes = tree ? Array.from(tree.getElementsByTagNameNS('*', '*')).filter((n) => n.localName === 'sp' || n.localName === 'pic') : [];
    for (const el of shapes) {
      const spPr = child(el, 'spPr'); const b = spPr ? box(spPr) : null;
      if (el.localName === 'pic') {
        const blip = kids(el, 'blip')[0]; const id = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ?? blip?.getAttribute('r:embed');
        const src = id && rel.get(id) ? await imageUrl(files, rel.get(id)!, urls) : null;
        if (src && b) body += `<img src="${src}" alt="" style="position:absolute;left:${b.l}%;top:${b.t}%;width:${b.w}%;height:${b.h}%;object-fit:contain">`;
        continue;
      }
      const tx = child(el, 'txBody'); const fill = spPr ? color(child(spPr, 'solidFill')) : null;
      const paras = tx ? kids(tx, 'p').map((p) => runsHtml(p, W / 12700)) : [];
      const ph = kids(el, 'ph')[0]?.getAttribute('type') ?? (kids(el, 'ph')[0] ? 'body' : '');
      const centered = ph === 'ctrTitle' || ph === 'subTitle';
      const content = paras.map((h) => `<p style="margin:0 0 .3em${centered ? ';text-align:center' : ''}">${h || '&nbsp;'}</p>`).join('');
      if (!content.replace(/<[^>]+>|&nbsp;/g, '').trim() && !fill) continue;
      // where PowerPoint puts title / subtitle / text placeholders when the slide does not say
      const place: Record<string, [number, number, number, number, string]> = {
        ctrTitle: [8, 26, 84, 22, 'font-size:5.2cqw;font-weight:700'], subTitle: [12, 52, 76, 16, 'font-size:2.6cqw;color:#475569'],
        title: [5, 4, 90, 15, 'font-size:3.8cqw;font-weight:700'], body: [5, 22, 90, 70, 'font-size:2.2cqw'],
      };
      const d0 = place[ph] ?? null; const pb = b ?? (d0 ? { l: d0[0], t: d0[1], w: d0[2], h: d0[3] } : null);
      const baseFont = b ? (ph === 'ctrTitle' || ph === 'title' ? 'font-size:3.8cqw;font-weight:700' : 'font-size:1.5cqw') : d0?.[4] ?? 'font-size:2.2cqw';
      body += pb ? `<div style="position:absolute;left:${pb.l}%;top:${pb.t}%;width:${pb.w}%;min-height:${pb.h}%;${fill ? `background:${fill};` : ''}overflow:hidden;${baseFont};line-height:1.25;${centered ? 'display:flex;flex-direction:column;justify-content:center' : ''}">${content}</div>`
        : `<div style="position:relative;padding:2% 4%;font-size:2.2cqw">${content}</div>`;
    }
    slides.push(`<section class="kg-slide" aria-label="Slide ${i + 1}" style="position:relative;width:100%;aspect-ratio:${W}/${H};background:${bg};container-type:inline-size;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.12);border-radius:8px;margin:0 auto 16px;font-family:Calibri,Arial,sans-serif;color:#111">${body}<span style="position:absolute;right:1.2%;bottom:1%;font-size:1.4cqw;color:#64748b">${i + 1}</span></section>`);
  }
  if (!slides.length) throw new Error('No slides were found in this file');
  return { html: slides.join(''), count: slides.length, urls };
}

// ------------------------------------------------------------------ Word
export async function renderDocx(buf: ArrayBuffer) {
  const files = await unzip(buf); const urls: string[] = []; const td = new TextDecoder();
  const f = files.get('word/document.xml'); if (!f) throw new Error('This is not a Word (.docx) file');
  const d = xml(td.decode(await f())); const rel = await rels(files, 'word/document.xml');
  const run = async (r: Element) => {
    let h = '';
    for (const c of Array.from(r.children)) {
      if (c.localName === 't') h += esc(c.textContent ?? '');
      else if (c.localName === 'tab') h += '&emsp;';
      else if (c.localName === 'br') h += '<br>';
      else if (c.localName === 'drawing' || c.localName === 'pict') {
        const blip = kids(c, 'blip')[0]; const id = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ?? blip?.getAttribute('r:embed');
        const src = id && rel.get(id) ? await imageUrl(files, rel.get(id)!, urls) : null;
        if (src) h += `<img src="${src}" alt="" style="max-width:100%;height:auto;vertical-align:middle">`;
      }
    }
    const pr = child(r, 'rPr'); if (!pr || !h) return h;
    if (child(pr, 'b')) h = `<b>${h}</b>`; if (child(pr, 'i')) h = `<i>${h}</i>`; if (child(pr, 'u')) h = `<u>${h}</u>`;
    const c = child(pr, 'color')?.getAttribute('w:val') ?? child(pr, 'color')?.getAttributeNS('*', 'val'); if (c && /^[0-9a-f]{6}$/i.test(c)) h = `<span style="color:#${c}">${h}</span>`;
    return h;
  };
  const para = async (p: Element) => {
    let inner = ''; for (const r of Array.from(p.children)) { if (r.localName === 'r') inner += await run(r); else if (r.localName === 'hyperlink') for (const rr of kids(r, 'r')) inner += await run(rr); }
    const style = kids(p, 'pStyle')[0]?.getAttribute('w:val') ?? '';
    const list = kids(p, 'numPr').length > 0 || /^List/i.test(style);
    const h = /^(Heading|Title)(\d?)$/i.exec(style); const lvl = h ? Math.min(4, Number(h[2] || 1) + 1) : 0;
    const sizes: Record<number, string> = { 2: '1.75em', 3: '1.4em', 4: '1.2em' };
    if (lvl) return `<h${lvl} style="margin:.8em 0 .35em;font-size:${sizes[lvl]};font-weight:700;color:#1e3a8a;line-height:1.25">${inner}</h${lvl}>`;
    return list ? `<li>${inner}</li>` : `<p style="margin:0 0 .6em;min-height:1em">${inner}</p>`;
  };
  let html = ''; let inList = false;
  const bodyEl = kids(d, 'body')[0];
  for (const el of Array.from(bodyEl?.children ?? [])) {
    if (el.localName === 'p') {
      const h = await para(el); const li = h.startsWith('<li>');
      if (li && !inList) { html += '<ul style="list-style:disc;padding-left:1.6em;margin:0 0 .6em">'; inList = true; } if (!li && inList) { html += '</ul>'; inList = false; }
      html += h;
    } else if (el.localName === 'tbl') {
      if (inList) { html += '</ul>'; inList = false; }
      let t = '<table style="border-collapse:collapse;width:100%;margin:.6em 0">';
      for (const tr of kids(el, 'tr')) { t += '<tr>'; for (const tc of kids(tr, 'tc')) { let c = ''; for (const p of kids(tc, 'p')) c += await para(p); t += `<td style="border:1px solid #cbd5e1;padding:4px 6px;vertical-align:top">${c}</td>`; } t += '</tr>'; }
      html += `${t}</table>`;
    }
  }
  if (inList) html += '</ul>';
  return { html: `<article style="max-width:820px;margin:0 auto;background:#fff;padding:48px 56px;box-shadow:0 2px 10px rgba(0,0,0,.12);border-radius:8px;font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.55;color:#111">${html}</article>`, urls };
}
