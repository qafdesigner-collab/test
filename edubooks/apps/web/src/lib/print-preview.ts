'use client';
/**
 * Print preview inside the app (no pop-up window): ← Back, 🖨 Print and ⬇ Download PDF.
 * The PDF is made in the browser: every A4 sheet is drawn to an image and packed into a PDF file by a small writer below.
 */

const A4 = { w: 595.28, h: 841.89 }; // points
const PX = { w: 794, h: 1123 }; // A4 at 96 dpi

let open: { close: () => void } | null = null;

export function showPrintPreview(title: string, html: string, opts: { landscape?: boolean } = {}) {
  open?.close();
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<div class="bar">[\s\S]*?<\/div>/i, '');
  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', `${title} — preview`);
  wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#e2e8f0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;background:#fff;border-bottom:1px solid #cbd5e1;box-shadow:0 1px 4px rgba(0,0,0,.06);flex-wrap:wrap';
  const btn = (label: string, primary = false) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = `font:600 15px system-ui,sans-serif;padding:9px 16px;border-radius:12px;cursor:pointer;border:1px solid ${primary ? '#4f46e5' : '#cbd5e1'};background:${primary ? '#4f46e5' : '#fff'};color:${primary ? '#fff' : '#1e293b'}`;
    return b;
  };
  const back = btn('← Back'); const name = document.createElement('div');
  name.textContent = title; name.style.cssText = 'flex:1;min-width:8rem;font:700 16px system-ui,sans-serif;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  const print = btn('🖨 Print'); const pdf = btn('⬇ Download PDF', true);
  const note = document.createElement('div'); note.style.cssText = 'width:100%;font-size:13px;color:#475569;display:none';
  bar.append(back, name, print, pdf, note);
  const frame = document.createElement('iframe');
  frame.title = title; frame.style.cssText = 'flex:1;width:100%;border:0;background:#e2e8f0';
  frame.srcdoc = clean;
  wrap.append(bar, frame);
  document.body.appendChild(wrap);
  const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';

  // Phone / browser back button closes the preview too.
  history.pushState({ kgPreview: true }, '');
  const onPop = () => close(true);
  window.addEventListener('popstate', onPop);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') back.click(); };
  window.addEventListener('keydown', onKey);
  function close(fromHistory = false) {
    window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey);
    wrap.remove(); document.body.style.overflow = prevOverflow; open = null;
    if (!fromHistory && history.state?.kgPreview) history.back();
  }
  back.onclick = () => close();
  print.onclick = () => { const w = frame.contentWindow; if (!w) return; w.focus(); w.print(); };
  pdf.onclick = async () => {
    const doc = frame.contentDocument; if (!doc) return;
    pdf.disabled = true; const label = pdf.textContent; pdf.textContent = 'Making PDF…'; note.style.display = 'none';
    try {
      const pages = await renderPages(doc, !!opts.landscape);
      const blob = makePdf(pages);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.setAttribute('download', `${title.replace(/[\\/:*?"<>|—–]+/g, '-').replace(/\s+/g, ' ').trim() || 'document'}.pdf`);
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    } catch {
      note.textContent = 'This browser cannot make the PDF file directly. In the print window, choose “Save as PDF” as the printer.';
      note.style.display = 'block'; print.click();
    } finally { pdf.disabled = false; pdf.textContent = label; }
  };
  open = { close: () => close() };
  return { frame, setHtml: (h: string) => { frame.srcdoc = h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<div class="bar">[\s\S]*?<\/div>/i, ''); } };
}

// ------------------------------------------------------------------ drawing the pages
async function toDataUrl(src: string) {
  if (!src || src.startsWith('data:')) return src;
  const res = await fetch(src, { credentials: 'include' }); const b = await res.blob();
  return new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); });
}

async function drawElement(el: HTMLElement, css: string, w: number, h: number, extraCss = '') {
  const clone = el.cloneNode(true) as HTMLElement;
  const imgs = Array.from(clone.querySelectorAll('img'));
  const orig = Array.from(el.querySelectorAll('img'));
  await Promise.all(imgs.map(async (img, i) => { try { img.setAttribute('src', await toDataUrl(orig[i]?.currentSrc || orig[i]?.src || img.src)); } catch { img.remove(); } }));
  const xhtml = new XMLSerializer().serializeToString(clone);
  // the document's own font and colour (a single sheet drawn alone would otherwise fall back to a serif font)
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el.ownerDocument.body);
  const font = `${cs.fontFamily}, Arial, Helvetica, sans-serif`; const color = cs.color;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:#fff;font-family:${font.replace(/"/g, "'")};color:${color}"><style>${css.replace(/<\/?style>/g, '')}${extraCss}</style>${xhtml}</div></foreignObject></svg>`;
  const img = new Image(); img.decoding = 'sync';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const scale = 2; const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, w, h);
  return c;
}

/** One image per A4 page: documents made of .sheet pages are drawn sheet by sheet; others are drawn whole and cut into pages. */
async function renderPages(doc: Document, landscape: boolean) {
  const css = Array.from(doc.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
  const out: { jpeg: Uint8Array; w: number; h: number; landscape: boolean }[] = [];
  const sheets = Array.from(doc.querySelectorAll<HTMLElement>('.sheet'));
  if (sheets.length) {
    for (const s of sheets) {
      const r = s.getBoundingClientRect(); const land = r.width > r.height;
      const c = await drawElement(s, css, Math.round(r.width), Math.round(r.height), '.sheet{margin:0!important;box-shadow:none!important}');
      out.push({ jpeg: jpegBytes(c), w: c.width, h: c.height, landscape: land });
    }
    return out;
  }
  const pageW = landscape ? PX.h : PX.w; const pageH = landscape ? PX.w : PX.h;
  // lay the document out at A4 width while it is drawn
  const root = doc.documentElement; const prevW = root.style.width; root.style.width = `${pageW}px`;
  let whole: HTMLCanvasElement;
  try { const totalH = Math.max(pageH, root.scrollHeight); whole = await drawElement(doc.body, css, pageW, totalH); } finally { root.style.width = prevW; }
  const totalH = whole.height / 2;
  const scale = whole.width / pageW;
  for (let y = 0; y < totalH; y += pageH) {
    const c = document.createElement('canvas'); c.width = Math.round(pageW * scale); c.height = Math.round(pageH * scale);
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(whole, 0, Math.round(y * scale), c.width, c.height, 0, 0, c.width, c.height);
    out.push({ jpeg: jpegBytes(c), w: c.width, h: c.height, landscape });
  }
  return out;
}

function jpegBytes(c: HTMLCanvasElement) {
  const b64 = c.toDataURL('image/jpeg', 0.9).split(',')[1]; // throws when the browser does not allow it (then we print instead)
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

// ------------------------------------------------------------------ a tiny PDF writer (one JPEG per A4 page)
function makePdf(pages: { jpeg: Uint8Array; w: number; h: number; landscape: boolean }[]) {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const offsets: number[] = []; let len = 0;
  const push = (x: string | Uint8Array) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n: number, body: (string | Uint8Array)[]) => { offsets[n] = len; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`]);
  pages.forEach((p, i) => {
    const page = 3 + i * 3; const img = page + 1; const content = page + 2;
    const W = p.landscape ? A4.h : A4.w; const H = p.landscape ? A4.w : A4.h;
    const draw = `q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q`;
    obj(page, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`]);
    obj(img, [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
    obj(content, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
  });
  const count = 3 + pages.length * 3;
  const xref = len;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}
