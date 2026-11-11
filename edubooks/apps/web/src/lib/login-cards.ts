'use client';
import QRCode from 'qrcode';

export interface CardInfo { displayName: string; username: string; password: string; role?: string; className?: string | null }
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Printable login cards (8 per A4 page). The QR code opens the sign-in page with the school code and
 * username filled in. The password is printed on the card only, never put in the QR code.
 */
export async function printLoginCards(cards: CardInfo[], school: { code?: string; name?: string }) {
  const w = window.open('', '_blank'); if (!w) return;
  w.document.write('<p style="font-family:system-ui">Preparing cards…</p>');
  const items = await Promise.all(cards.map(async (c) => {
    const url = `${location.origin}/login?${new URLSearchParams({ ...(school.code ? { school: school.code } : {}), u: c.username }).toString()}`;
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
    return `<div class="card"><div class="top"><span class="logo">📚 Knowledge Gate</span><span class="school">${esc(school.name ?? '')}</span></div>
      <div class="body"><div class="info"><div class="name">${esc(c.displayName)}</div>${c.className || c.role ? `<div class="meta">${esc([c.role, c.className].filter(Boolean).join(' · '))}</div>` : ''}
        <table>${school.code ? `<tr><td>School code</td><td><b>${esc(school.code)}</b></td></tr>` : ''}<tr><td>Username</td><td><b>${esc(c.username)}</b></td></tr><tr><td>Password</td><td><b>${esc(c.password)}</b></td></tr></table></div>
        <div class="qr"><img src="${qr}" alt=""><small>Scan to sign in</small></div></div>
      <div class="foot">${esc(location.host)}/login · Keep this card safe</div></div>`;
  }));
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Login cards</title><style>
    @page{size:A4;margin:10mm} *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1e293b}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm} .card{border:2.5px solid #6366f1;border-radius:14px;padding:4mm 5mm;height:64mm;break-inside:avoid;display:flex;flex-direction:column;background:linear-gradient(135deg,#fff,#eef2ff)}
    .card:nth-child(4n+2){border-color:#ec4899;background:linear-gradient(135deg,#fff,#fdf2f8)} .card:nth-child(4n+3){border-color:#10b981;background:linear-gradient(135deg,#fff,#ecfdf5)} .card:nth-child(4n+4){border-color:#f59e0b;background:linear-gradient(135deg,#fff,#fffbeb)}
    .top{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#475569} .logo{font-weight:800;color:#4338ca}
    .body{display:flex;gap:4mm;flex:1;align-items:center} .info{flex:1;min-width:0} .name{font-size:18px;font-weight:800;margin:1mm 0} .meta{font-size:12px;color:#475569;margin-bottom:1mm}
    table{font-size:13px;border-collapse:collapse} td{padding:0.6mm 2mm 0.6mm 0} td:first-child{color:#475569}
    .qr{text-align:center;font-size:9px;color:#475569} .qr img{width:30mm;height:30mm;display:block} .foot{font-size:9px;color:#64748b;text-align:center}
    .bar{padding:10px;font-family:system-ui;text-align:center} @media print{.bar{display:none}}
  </style></head><body><div class="bar"><button onclick="print()" style="font-size:16px;padding:8px 18px">Print ${cards.length} card(s)</button></div>
  <div class="grid">${items.join('')}</div><script>setTimeout(()=>print(),400)</script></body></html>`);
  w.document.close();
}
