import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';

export const PROTECTION_DEFAULTS = { enabled: true, teachers: true };

/**
 * Whether the signed-in user may only VIEW book content inside the platform (no downloads, no copying),
 * and the watermark text shown over it. Publisher staff are never restricted.
 */
export async function protectionFor(db: DbService): Promise<{ protect: boolean; watermark: string }> {
  const ctx = db.ctx;
  if (!ctx || ctx.staff || !ctx.schoolId) return { protect: false, watermark: '' };
  const { rows } = await db.q.execute(sql`SELECT content_protection() AS p, (SELECT display_name FROM users WHERE id = ${ctx.userId}) AS name,
    (SELECT code FROM schools WHERE id = ${ctx.schoolId}) AS code`);
  const r = rows[0] as any;
  const s = { ...PROTECTION_DEFAULTS, ...(r?.p ?? {}) };
  const staffLike = ctx.roles.some((x) => x === 'TEACHER' || x === 'SCHOOL_ADMIN');
  const protect = !!s.enabled && (!staffLike || !!s.teachers);
  return { protect, watermark: protect ? `${r?.name ?? ''} · ${r?.code ?? ''} · ${new Date().toISOString().slice(0, 10)}` : '' };
}

/**
 * Script added to flipbook / CD pages for protected viewers: no right-click, copying, saving, printing or developer tools;
 * one faint publisher logo in the centre with the reader's name under it; covered when the reader leaves the page.
 */
export function guardScript(watermark: string) {
  const w = JSON.stringify(watermark);
  return `<style>@media print{html,body{display:none!important}}html,body{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
#kg-wm{position:fixed;inset:0;pointer-events:none;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;opacity:.14}
#kg-wm img{width:min(34vw,260px);max-height:34vh;object-fit:contain;filter:grayscale(1)}#kg-wm span{font:600 12px system-ui,sans-serif;color:#000;white-space:nowrap}
#kg-sh{position:fixed;inset:0;z-index:2147483647;background:#0f172a;color:#fff;display:none;align-items:center;justify-content:center;font:600 18px system-ui,sans-serif;text-align:center;padding:20px;cursor:pointer}</style>
<script>(function(){var W=${w};function show(){var h=document.getElementById('kg-sh');if(h)h.style.display='flex';}
function wm(){if(document.getElementById('kg-wm')||!document.body)return;var d=document.createElement('div');d.id='kg-wm';var i=document.createElement('img');i.src='/api/branding/logo';i.alt='';i.onerror=function(){i.remove();};d.appendChild(i);
if(W){var s=document.createElement('span');s.textContent=W;d.appendChild(s);}document.body.appendChild(d);
var h=document.createElement('div');h.id='kg-sh';h.textContent='🔒 Protected book. Click here to continue reading.';h.onclick=function(){h.style.display='none'};document.body.appendChild(h);}
document.addEventListener('DOMContentLoaded',wm);setTimeout(wm,500);
['contextmenu','copy','cut','dragstart','selectstart','beforeprint'].forEach(function(e){document.addEventListener(e,function(x){x.preventDefault();if(e==='beforeprint')show();},true);});
window.addEventListener('beforeprint',show);
document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();var m=e.ctrlKey||e.metaKey;if(k==='printscreen'||k==='f12'||(m&&['s','p','c','x','a','u'].indexOf(k)>=0)||(m&&e.shiftKey&&['i','j','c','s','k'].indexOf(k)>=0)||(e.metaKey&&e.altKey&&['i','j','c','u'].indexOf(k)>=0)){e.preventDefault();e.stopPropagation();if(k==='printscreen'){try{navigator.clipboard.writeText('')}catch(_){}show();}}},true);
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')show();});
window.print=function(){};})();</script>`;
}
