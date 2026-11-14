// App shell: login, layout, navigation and hash router.
import { api, esc, $, $$, state, BRAND, toast, act, avatars, formData } from './core.js';
import { booksPage, bookPage } from './books.js';
import adminRoutes from './admin.js';
import salesRoutes from './sales.js';
import schoolRoutes from './school.js';
import teacherRoutes from './teacher.js';
import studentRoutes from './student.js';

const ROLE_ROUTES = { admin: adminRoutes, sales: salesRoutes, school: schoolRoutes, teacher: teacherRoutes, student: studentRoutes };
const ROLE_NAME = { admin: 'Publisher Admin', sales: 'Sales Team', school: 'School Admin', teacher: 'Teacher', student: 'Student' };
const common = [
  { path: '/book/:id', render: bookPage },
  { path: '/profile', label: 'My Profile', icon: '🙂', render: profilePage },
];
let routes = [];

async function boot() {
  try { const me = await api('/me'); state.user = me.user; state.ai = me.ai; } catch { state.user = null; }
  if (!state.user) return loginPage();
  routes = [...ROLE_ROUTES[state.user.role], ...common];
  if (!routes.some((r) => r.path === '/books')) routes.push({ path: '/books', render: booksPage });
  layout();
  window.onhashchange = render;
  render();
}

function loginPage() {
  document.body.className = 'login-body';
  window.onhashchange = null;
  $('#app').innerHTML = `<div class="login-wrap">
    <div class="floaties" aria-hidden="true">${['🎈', '⭐', '📚', '🌈', '✏️', '🎨', '🦄', '🚀', '🍎', '🔤'].map((e, i) => `<span style="--i:${i}">${e}</span>`).join('')}</div>
    <form class="login-card form" id="login">
      <div class="logo">${BRAND.logo}</div><h1>${esc(BRAND.name)}</h1><p class="tagline">${esc(BRAND.tagline)}</p>
      <label>🏫 School code<input name="code" autocomplete="organization" placeholder="e.g. DEMO01"></label>
      <label>👤 Username<input name="username" required autocomplete="username"></label>
      <label>🔑 Password<input name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn green big">Let's go! 🚀</button>
      <p class="muted small">Publisher &amp; sales team: leave school code empty.</p>
    </form></div>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    await act(e.submitter, () => api('/login', { body: formData(e.target) }));
    location.hash = ''; boot();
  };
}

function layout() {
  const u = state.user;
  document.body.className = `role-${u.role}`;
  const nav = routes.filter((r) => r.label && r.nav !== false);
  const demo = u.school?.is_demo ? `<div class="demo-bar">🎁 Demo account · expires ${new Date(u.school.expires_at).toLocaleDateString()}</div>` : '';
  $('#app').innerHTML = `${demo}<header class="topbar">
      <button class="icon-btn menu" aria-label="Menu">☰</button>
      <a class="brand" href="#/">${BRAND.logo} <span>${esc(BRAND.name)}</span></a>
      ${u.school ? `<span class="school-name">🏫 ${esc(u.school.name)}</span>` : ''}
      <div class="spacer"></div>
      ${u.role === 'student' ? `<span class="star-pill" id="starPill">⭐ ${u.stars}</span>` : ''}
      <a class="me" href="#/profile"><span class="avatar">${esc(u.avatar)}</span><span class="me-name">${esc(u.name)}<small>${ROLE_NAME[u.role]}</small></span></a>
      <button class="btn small ghost" id="logout">Logout</button>
    </header>
    <div class="shell"><nav class="sidenav">${nav.map((r) => `<a href="#${r.path}" data-path="${r.path}"><span>${r.icon}</span>${esc(r.label)}</a>`).join('')}</nav>
    <main id="main" tabindex="-1"></main></div>`;
  $('#logout').onclick = async () => { await api('/logout', { method: 'POST' }); state.user = null; state.books = null; location.hash = ''; loginPage(); };
  $('.menu').onclick = () => document.body.classList.toggle('nav-open');
}

function match(path) {
  for (const r of routes) {
    const keys = [];
    const re = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    const m = path.match(re);
    if (m) return { r, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

async function render() {
  const [rawPath, qs] = location.hash.slice(1).split('?');
  const path = rawPath && rawPath !== '/' ? rawPath : routes[0].path;
  const found = match(path) || { r: routes[0], params: {} };
  document.body.classList.remove('nav-open');
  $$('.sidenav a').forEach((a) => a.classList.toggle('active', path === a.dataset.path || path.startsWith(a.dataset.path + '/')));
  const main = $('#main');
  main.innerHTML = '<div class="loading">⏳</div>';
  try {
    await found.r.render(main, found.params, Object.fromEntries(new URLSearchParams(qs || '')));
  } catch (e) {
    main.innerHTML = `<div class="empty">😕 ${esc(e.message)}</div>`;
  }
  window.scrollTo(0, 0);
}

async function profilePage(main) {
  const u = state.user;
  main.innerHTML = `<div class="page-head"><h1>🙂 My Profile</h1></div>
    <div class="grid two">
      <div class="card"><h2>Pick your avatar</h2><div class="avatar-pick">${avatars.map((a) => `<button class="${a === u.avatar ? 'on' : ''}" data-a="${a}">${a}</button>`).join('')}</div></div>
      <form class="card form" id="pw"><h2>🔑 Change password</h2>
        <label>Current password<input type="password" name="current" required></label>
        <label>New password<input type="password" name="next" required minlength="4"></label>
        <button class="btn blue">Change password</button></form>
    </div>`;
  $$('.avatar-pick button', main).forEach((b) => {
    b.onclick = async () => { await api('/me/avatar', { body: { avatar: b.dataset.a } }); state.user.avatar = b.dataset.a; layout(); render(); toast('Looking good! ✨'); };
  });
  $('#pw').onsubmit = async (e) => { e.preventDefault(); await act(e.submitter, () => api('/me/password', { body: formData(e.target) }), 'Password changed ✅'); e.target.reset(); };
}

boot();
