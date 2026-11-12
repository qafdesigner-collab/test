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

/** Script added to flipbook / CD pages for protected viewers: no right-click, copying, saving or printing; a name watermark; hidden when the window loses focus. */
export function guardScript(watermark: string) {
  const w = JSON.stringify(watermark);
  return `<style>@media print{html,body{display:none!important}}html,body{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
#kg-wm{position:fixed;inset:0;pointer-events:none;z-index:2147483646;opacity:.13;font:600 15px system-ui,sans-serif;color:#000;overflow:hidden;display:flex;flex-wrap:wrap;align-content:flex-start;gap:70px 90px;padding:40px;transform:rotate(-24deg) scale(1.4)}
#kg-sh{position:fixed;inset:0;z-index:2147483647;background:#0f172a;color:#fff;display:none;align-items:center;justify-content:center;font:600 18px system-ui,sans-serif;text-align:center;padding:20px}</style>
<script>(function(){var W=${w};function wm(){if(!W||document.getElementById('kg-wm')||!document.body)return;var d=document.createElement('div');d.id='kg-wm';for(var i=0;i<80;i++){var s=document.createElement('span');s.textContent=W;d.appendChild(s);}document.body.appendChild(d);
var h=document.createElement('div');h.id='kg-sh';h.textContent='Content is protected. Click here to continue reading.';h.onclick=function(){h.style.display='none'};document.body.appendChild(h);}
document.addEventListener('DOMContentLoaded',wm);setTimeout(wm,500);
['contextmenu','copy','cut','dragstart','selectstart'].forEach(function(e){document.addEventListener(e,function(x){x.preventDefault();},true);});
document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();if(k==='printscreen'||((e.ctrlKey||e.metaKey)&&['s','p','c','x','a','u'].indexOf(k)>=0)||((e.ctrlKey||e.metaKey)&&e.shiftKey&&['i','j','c','s'].indexOf(k)>=0)){e.preventDefault();e.stopPropagation();if(k==='printscreen'){try{navigator.clipboard.writeText('')}catch(_){}}var h=document.getElementById('kg-sh');if(h&&k==='printscreen')h.style.display='flex';}},true);
document.addEventListener('visibilitychange',function(){var h=document.getElementById('kg-sh');if(h&&document.visibilityState==='hidden')h.style.display='flex';});
window.print=function(){};})();</script>`;
}
