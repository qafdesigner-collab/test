// Publisher admin: dashboard, books, schools & licences, sales team, demos.
import { api, esc, $, $$, modal, act, confirmBox, toast, opt, formData, fmtDate, state } from './core.js';
import { booksPage, loadBooks } from './books.js';
import { demosPage } from './sales.js';

async function dashboard(main) {
  const s = await api('/admin/stats');
  const tiles = [['📚', 'Books', s.books, '#/books', 'red'], ['🏫', 'Schools', s.schools, '#/schools', 'blue'],
    ['🎟️', 'Seats sold', s.seats, '#/schools', 'yellow'], ['👩‍🏫', 'Teachers', s.teachers, '#/schools', 'green'],
    ['🧒', 'Students', s.students, '#/schools', 'purple'], ['📂', 'Files', s.materials, '#/books', 'orange']];
  main.innerHTML = `<div class="page-head"><h1>👑 Welcome, ${esc(state.user.name)}!</h1></div>
    <div class="grid tiles">${tiles.map(([i, l, n, h, c]) => `<a class="tile ${c}" href="${h}"><span class="ti">${i}</span><b>${n}</b><span>${l}</span></a>`).join('')}</div>
    <div class="card"><h2>🧭 Quick start</h2><ol class="steps">
      <li><a href="#/books">Create a book</a> → add Parts, Homework Book and Resources → upload PPT / PDF / Word / HTML files.</li>
      <li><a href="#/schools">Add a school</a> with its code, username and password.</li>
      <li>Give the school licences (seats) for each book it bought.</li>
      <li>The school logs in, creates teachers, classes and students.</li>
      <li><a href="#/sales-team">Add sales people</a> — they can create instant demo schools for prospects.</li></ol></div>`;
}

async function schoolsPage(main) {
  const [schools, books] = await Promise.all([api('/admin/schools'), loadBooks(true)]);
  const real = schools.filter((s) => !s.is_demo);
  main.innerHTML = `<div class="page-head"><h1>🏫 Schools</h1><button class="btn green" id="add">➕ Add school</button></div>
    ${real.length ? `<div class="grid cards">${real.map((s) => `<div class="card school ${s.active ? '' : 'off'}">
      <div class="row between"><h3>${esc(s.name)}</h3><span class="tag ${s.active ? 'green' : 'red'}">${s.active ? 'Active' : 'Disabled'}</span></div>
      <p class="muted">Code <b class="code">${esc(s.code)}</b> · ${esc(s.city)} ${s.contact ? '· ' + esc(s.contact) : ''}</p>
      <p class="muted small">Login: ${s.admins.map((a) => esc(a.username)).join(', ') || '—'} · 👩‍🏫 ${s.teachers} · 🧒 ${s.students}${s.sales_name ? ' · 💼 ' + esc(s.sales_name) : ''}</p>
      ${s.licenses.map((l) => seatBar(l)).join('') || '<p class="muted small">No books licensed yet.</p>'}
      <div class="row"><button class="btn small yellow lic" data-id="${s.id}">🎟️ Licences</button><button class="btn small blue ed" data-id="${s.id}">✏️ Edit</button>
      <button class="icon-btn del" data-id="${s.id}" title="Delete">🗑️</button></div></div>`).join('')}</div>` : '<div class="empty">No schools yet — add your first customer! 🎉</div>'}
    <p class="muted">Demo schools made by the sales team are under <a href="#/demos">Demos</a>.</p>`;
  $('#add').onclick = () => editSchool(null);
  $$('.ed', main).forEach((b) => { b.onclick = () => editSchool(schools.find((s) => s.id == b.dataset.id)); });
  $$('.lic', main).forEach((b) => { b.onclick = () => licences(schools.find((s) => s.id == b.dataset.id), books); });
  $$('.del', main).forEach((b) => {
    b.onclick = async () => {
      const s = schools.find((x) => x.id == b.dataset.id);
      if (await confirmBox(`Delete ${s.name}? ALL its teachers, students and results will be removed.`)) { await api(`/admin/schools/${s.id}`, { method: 'DELETE' }); schoolsPage(main); }
    };
  });
}

export const seatBar = (l) => {
  const pct = l.seats ? Math.min(100, (l.used / l.seats) * 100) : 0;
  return `<div class="seat"><span>${esc(l.emoji)} ${esc(l.title)}</span><div class="bar"><div style="width:${pct}%;background:${esc(l.color)}"></div></div><small>${l.used}/${l.seats}</small></div>`;
};

function editSchool(s) {
  const m = modal(s ? `✏️ ${esc(s.name)}` : '🏫 New school', `<form class="form">
    <label>School name<input name="name" required value="${esc(s?.name)}"></label>
    <div class="row"><label>School code<input name="code" ${s ? 'disabled' : 'required'} value="${esc(s?.code)}" placeholder="SUN01"></label>
    <label>City<input name="city" value="${esc(s?.city)}"></label></div>
    <label>Contact (person / phone)<input name="contact" value="${esc(s?.contact)}"></label>
    <div class="row"><label>School login username<input name="username" ${s ? '' : 'required'} value="${esc(s?.admins?.[0]?.username || '')}" placeholder="principal"></label>
    <label>${s ? 'New password (leave empty to keep)' : 'Password'}<input name="password" ${s ? '' : 'required'}></label></div>
    ${s ? `<label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> School is active (can log in)</label>` : ''}
    <div class="row end"><button class="btn green">💾 Save</button></div></form>`);
  const f = $('form', m.el);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f);
    if (s) { d.active = !!d.active; if (!d.password) delete d.password; }
    await act(e.submitter, () => (s ? api(`/admin/schools/${s.id}`, { method: 'PUT', body: d }) : api('/admin/schools', { body: d })), 'Saved ✅');
    m.close(); schoolsPage($('#main'));
  };
}

function licences(s, books) {
  const m = modal(`🎟️ Licences · ${esc(s.name)}`, `<p class="muted">How many student seats did this school buy for each book? Set 0 to remove a book.</p>
    <div class="lic-list">${books.map((b) => { const l = s.licenses.find((x) => x.book_id === b.id);
    return `<div class="lic-row"><span>${esc(b.emoji)} ${esc(b.title)}</span>${l ? `<small class="muted">${l.used} in use</small>` : ''}
      <input type="number" min="0" value="${l ? l.seats : 0}" data-b="${b.id}"></div>`; }).join('')}</div>
    <div class="row end"><button class="btn green save">💾 Save licences</button></div>`);
  $('.save', m.el).onclick = async (e) => {
    await act(e.currentTarget, async () => {
      for (const inp of $$('input', m.el)) {
        const before = s.licenses.find((x) => x.book_id == inp.dataset.b)?.seats ?? 0;
        if (Number(inp.value) !== before) await api(`/admin/schools/${s.id}/licenses`, { method: 'PUT', body: { book_id: inp.dataset.b, seats: inp.value } });
      }
    }, 'Licences updated 🎟️');
    m.close(); schoolsPage($('#main'));
  };
}

async function salesTeam(main) {
  const people = await api('/admin/sales');
  main.innerHTML = `<div class="page-head"><h1>💼 Sales Team</h1><button class="btn green" id="add">➕ Add sales person</button></div>
    <p class="muted">Sales people log in without a school code. They can show all books and create instant demo schools.</p>
    <table class="table"><thead><tr><th></th><th>Name</th><th>Username</th><th>Demos</th><th>Converted</th><th>Status</th><th></th></tr></thead><tbody>
    ${people.map((p) => `<tr><td>${esc(p.avatar)}</td><td>${esc(p.name)}</td><td>${esc(p.username)}</td><td>${p.demos}</td><td>${p.converted}</td>
      <td>${p.active ? '<span class="tag green">Active</span>' : '<span class="tag red">Off</span>'}</td>
      <td class="right"><button class="btn small blue ed" data-id="${p.id}">✏️</button> <button class="icon-btn del" data-id="${p.id}">🗑️</button></td></tr>`).join('')
    || '<tr><td colspan="7" class="muted">No sales people yet.</td></tr>'}</tbody></table>`;
  const edit = (p) => {
    const m = modal(p ? '✏️ Sales person' : '💼 New sales person', `<form class="form">
      <label>Name<input name="name" required value="${esc(p?.name)}"></label>
      <label>Username<input name="username" ${p ? 'disabled' : 'required'} value="${esc(p?.username)}"></label>
      <label>${p ? 'New password (optional)' : 'Password'}<input name="password" ${p ? '' : 'required'}></label>
      ${p ? `<label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Active</label>` : ''}
      <div class="row end"><button class="btn green">💾 Save</button></div></form>`);
    $('form', m.el).onsubmit = async (e) => {
      e.preventDefault(); const d = formData(e.target);
      if (p) { d.active = !!d.active; if (!d.password) delete d.password; }
      await act(e.submitter, () => (p ? api(`/admin/sales/${p.id}`, { method: 'PUT', body: d }) : api('/admin/sales', { body: d })), 'Saved ✅');
      m.close(); salesTeam(main);
    };
  };
  $('#add').onclick = () => edit(null);
  $$('.ed', main).forEach((b) => { b.onclick = () => edit(people.find((p) => p.id == b.dataset.id)); });
  $$('.del', main).forEach((b) => { b.onclick = async () => { if (await confirmBox('Remove this sales person? Their demos stay.')) { await api(`/admin/sales/${b.dataset.id}`, { method: 'DELETE' }); salesTeam(main); } }; });
}

// Admin view of demos adds a "Convert to customer" button.
async function adminDemos(main) {
  await demosPage(main, {}, {}, {
    extraButton: (d) => (d.is_demo ? `<button class="btn small green conv" data-id="${d.id}">🤝 Convert to customer</button>` : ''),
    bind: () => $$('.conv', main).forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmBox('Convert this demo into a paying school? The expiry is removed. Then set its real licences in Schools.'))) return;
        await api(`/admin/schools/${b.dataset.id}`, { method: 'PUT', body: { convert: true } });
        toast('Welcome aboard! 🎉'); location.hash = '#/schools';
      };
    }),
  });
}

export default [
  { path: '/dashboard', label: 'Dashboard', icon: '🏠', render: dashboard },
  { path: '/books', label: 'Books', icon: '📚', render: booksPage },
  { path: '/schools', label: 'Schools', icon: '🏫', render: schoolsPage },
  { path: '/demos', label: 'Demos', icon: '🎁', render: adminDemos },
  { path: '/sales-team', label: 'Sales Team', icon: '💼', render: salesTeam },
];
export { fmtDate, opt };
