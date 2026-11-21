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
// the reader page around this frame already shows the logo watermark, so only the cover is added here
function wm(){if(document.getElementById('kg-sh')||!document.body)return;void W;
var h=document.createElement('div');h.id='kg-sh';h.textContent='🔒 Protected book. Click here to continue reading.';h.onclick=function(){h.style.display='none'};document.body.appendChild(h);}
document.addEventListener('DOMContentLoaded',wm);setTimeout(wm,500);
['contextmenu','copy','cut','dragstart','selectstart','beforeprint'].forEach(function(e){document.addEventListener(e,function(x){x.preventDefault();if(e==='beforeprint')show();},true);});
window.addEventListener('beforeprint',show);
document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();var m=e.ctrlKey||e.metaKey;if(k==='printscreen'||k==='f12'||(m&&['s','p','c','x','a','u'].indexOf(k)>=0)||(m&&e.shiftKey&&['i','j','c','s','k'].indexOf(k)>=0)||(e.metaKey&&e.altKey&&['i','j','c','u'].indexOf(k)>=0)){e.preventDefault();e.stopPropagation();if(k==='printscreen'){try{navigator.clipboard.writeText('')}catch(_){}show();}}},true);
document.addEventListener('visibilitychange',function(){var h=document.getElementById('kg-sh');if(!h)return;if(document.visibilityState==='hidden'){h.dataset.away='1';h.style.display='flex';}else if(h.dataset.away){delete h.dataset.away;h.style.display='none';}});document.addEventListener('keyup',function(e){var k=(e.key||'').toLowerCase();if(k==='printscreen'||k==='snapshot'){try{navigator.clipboard.writeText('')}catch(_){}show();}},true);document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();if(e.shiftKey&&(e.metaKey||k==='meta'||k==='os'))show();},true);
window.print=function(){};})();</script>`;
}

/**
 * Script added to HTML5 flipbooks: tells the reader around the frame which page(s) are open, so Ask Owl can explain exactly
 * that page. Uses the flipbook's own page API (FlipHTML5-style BookInfo), else a page number in the address, else the page
 * pictures that take the most room on screen. Only page numbers are sent.
 */
export const FLIP_PAGE_REPORTER = `<script>(function(){if(window.parent===window)return;var last='';
function vis(){var best=[],max=0;var im=document.querySelectorAll('img');for(var i=0;i<im.length;i++){var m=/\\/(?:page|pages|large|mobile)\\/(?:page)?0*(\\d+)\\.(?:jpe?g|png|webp)/i.exec(im[i].src||'');if(!m)continue;
if(im[i].checkVisibility&&!im[i].checkVisibility({opacityProperty:true,visibilityProperty:true}))continue;var r=im[i].getBoundingClientRect();
var a=Math.max(0,Math.min(r.right,innerWidth)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));if(a>0)best.push([+m[1],a]);if(a>max)max=a;}
return best.filter(function(x){return x[1]>=max*0.6}).map(function(x){return x[0]}).sort(function(a,b){return a-b}).slice(0,2);}
function cur(){try{if(window.BookInfo&&BookInfo.getCurrentPages){var a=BookInfo.getCurrentPages();if(a&&a.length)return Array.prototype.slice.call(a).map(Number).filter(function(n){return n>0}).slice(0,2);}}catch(e){}
var m=/[#&?](?:p|page|pg)=(\\d+)/i.exec(location.hash+'&'+location.search);if(m)return[+m[1]];return vis();}
setInterval(function(){var p=cur();var k=p.join(',');if(k&&k!==last){last=k;parent.postMessage({kgFlipPages:p},'*');}},700);})();</script>`;
