// Shared helpers: API calls, escaping, toasts, modals, confetti, printing.
export const BRAND = { name: 'Bright Books', tagline: 'Learning is fun!', logo: '📚' };
export const state = { user: null, ai: 'offline', books: null };

export async function api(path, { method, body, form } = {}) {
  const opts = { method: method || (body || form ? 'POST' : 'GET'), headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch('/api' + path, opts);
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  if (r.status === 401 && path !== '/login' && state.user) { location.hash = ''; location.reload(); }
  if (!r.ok) throw new Error(data?.error || `Request failed (${r.status})`);
  return data;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T') + (s.length <= 19 && !s.endsWith('Z') ? 'Z' : '')).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const formData = (form) => Object.fromEntries(new FormData(form).entries());
export const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(label)}</option>`;

export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('hide'), 3200);
  setTimeout(() => el.remove(), 3700);
}
// Wrap an async action: shows errors as toasts and disables the button while busy.
export async function act(btn, fn, okMsg) {
  if (btn) { btn.disabled = true; btn.dataset.label ??= btn.innerHTML; btn.innerHTML = '⏳ ' + btn.dataset.label; }
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, 'err'); throw e; } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.label; }
  }
}

export function modal(title, html, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${title}</h2><button class="icon-btn close" aria-label="Close">✖</button></div>
    <div class="modal-body">${html}</div></div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  $('.close', wrap).onclick = close;
  setTimeout(() => $('input,select,textarea', wrap)?.focus(), 30);
  return { el: $('.modal-body', wrap), close };
}
export function confirmBox(message) {
  return new Promise((resolve) => {
    const m = modal('Are you sure?', `<p>${esc(message)}</p><div class="row end"><button class="btn ghost no">Cancel</button><button class="btn red yes">Yes, do it</button></div>`,
      { onClose: () => resolve(false) });
    $('.no', m.el).onclick = () => m.close();
    $('.yes', m.el).onclick = () => { resolve(true); m.close(); };
  });
}

export function confetti(n = 80) {
  const colors = ['#ff6b6b', '#ffd43b', '#51cf66', '#4dabf7', '#cc5de8', '#ff922b'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = Math.random() * 0.6 + 's';
    c.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

export function printHTML(title, html) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.contentDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:8px;text-align:left}
  .card{display:inline-block;width:46%;margin:1%;border:2px dashed #888;border-radius:12px;padding:12px;vertical-align:top}
  h1{font-size:22px} pre{white-space:pre-wrap;font-family:inherit}</style></head><body>${html}</body></html>`);
  f.contentDocument.close();
  setTimeout(() => { f.contentWindow.print(); setTimeout(() => f.remove(), 1000); }, 200);
}

export function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Copied 📋'), () => toast('Copy failed', 'err'));
}

// ---- Books & materials ----
export const KIND = { part: '📗 Part', homework: '📝 Homework', resource: '🎁 Resource' };
export const RESOURCE_TYPES = {
  flashcard: '🃏 Flash Cards', teacher_card: '👩‍🏫 Teacher Cards', dangler: '🎐 Danglers', poster: '🖼️ Posters',
  worksheet: '📄 Worksheets', audio: '🎵 Audio / Rhymes', video: '🎬 Videos', other: '📦 Other',
};
export function fileIcon(name = '') {
  const e = name.split('.').pop().toLowerCase();
  if (['ppt', 'pptx', 'pps', 'ppsx'].includes(e)) return '📊';
  if (e === 'pdf') return '📕';
  if (['doc', 'docx'].includes(e)) return '📘';
  if (['xls', 'xlsx'].includes(e)) return '📗';
  if (['html', 'htm'].includes(e)) return '🌐';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) return '🖼️';
  if (['mp3', 'wav'].includes(e)) return '🎵';
  if (['mp4', 'webm'].includes(e)) return '🎬';
  return '📎';
}
export const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

export function openMaterial(m) {
  const url = `/api/materials/${m.id}/file`;
  const e = (m.original_name || '').split('.').pop().toLowerCase();
  let body;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) body = `<img class="viewer-img" src="${url}" alt="${esc(m.title)}">`;
  else if (['mp4', 'webm'].includes(e)) body = `<video class="viewer-media" src="${url}" controls autoplay></video>`;
  else if (['mp3', 'wav'].includes(e)) body = `<div class="center big-emoji">🎵</div><audio class="viewer-media" src="${url}" controls autoplay></audio>`;
  else if (['pdf', 'html', 'htm', 'txt'].includes(e)) body = `<iframe class="viewer-frame" src="${url}" sandbox="allow-scripts allow-popups allow-forms allow-modals allow-downloads" title="${esc(m.title)}"></iframe>`;
  else body = `<div class="center"><div class="big-emoji">${fileIcon(m.original_name)}</div>
    <p>This file opens in PowerPoint / Word / Excel. Download it to view or present.</p></div>`;
  modal(`${fileIcon(m.original_name)} ${esc(m.title)}`, `${body}
    <div class="row end"><a class="btn blue" href="${url}?download=1">⬇️ Download</a></div>`, { wide: true });
}

export const avatars = ['🦁', '🐯', '🐼', '🦊', '🐸', '🐵', '🦄', '🐰', '🐨', '🐶', '🐱', '🐧', '🐙', '🦋', '🐢', '🐬', '🌻', '🚀', '⭐', '🏫', '👑', '💼'];
export const stars = (n) => '⭐'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n)));

export function setStars(n) {
  state.user.stars = n;
  const p = document.getElementById('starPill');
  if (p) { p.textContent = `⭐ ${n}`; p.classList.add('pop'); setTimeout(() => p.classList.remove('pop'), 600); }
}
// Credentials sheet for a school (used by sales demos and admin).
export function credentialsHTML(title, code, logins, extra = '') {
  return `<h1>${esc(title)}</h1><p>Website: <b>${esc(location.origin)}</b> &nbsp; School code: <b>${esc(code)}</b></p>${extra}
  <table><tr><th>Role</th><th>Name</th><th>Username</th><th>Password</th></tr>
  ${logins.map((l) => `<tr><td>${esc(l.role)}</td><td>${esc(l.name)}</td><td><b>${esc(l.username)}</b></td><td><b>${esc(l.password)}</b></td></tr>`).join('')}</table>`;
}
