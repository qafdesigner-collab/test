// Sales team: show the catalogue and create instant demo schools for prospects.
import { api, esc, $, $$, modal, act, confirmBox, toast, opt, formData, fmtDate, printHTML, copyText, credentialsHTML } from './core.js';
import { booksPage, loadBooks } from './books.js';

const STATUS = { demo: '🎁 Demo running', interested: '😊 Interested', negotiating: '🤝 Negotiating', lost: '😞 Lost', converted: '✅ Customer' };

function showCredentials(name, data) {
  const text = `${name}\nWebsite: ${location.origin}\nSchool code: ${data.code}\nValid until: ${new Date(data.expires_at).toLocaleDateString()}\n\n`
    + data.logins.map((l) => `${l.role.toUpperCase()} (${l.name})\n  Username: ${l.username}\n  Password: ${l.password}`).join('\n');
  const m = modal('🎉 Demo ready!', `<p>Share these logins with <b>${esc(name)}</b>. Passwords are shown only now — print or copy them.</p>
    <div class="cred-box">${credentialsHTML('', data.code, data.logins, `<p>Valid until <b>${new Date(data.expires_at).toLocaleDateString()}</b></p>`)}</div>
    <div class="row end"><button class="btn blue cp">📋 Copy (WhatsApp / email)</button><button class="btn yellow pr">🖨️ Print</button></div>`, { wide: true });
  $('.cp', m.el).onclick = () => copyText(text);
  $('.pr', m.el).onclick = () => printHTML('Demo logins', credentialsHTML(`${name} — Demo logins`, data.code, data.logins,
    `<p>Valid until <b>${new Date(data.expires_at).toLocaleDateString()}</b></p>`));
}

async function newDemo(onDone) {
  const books = await loadBooks();
  const m = modal('🎁 Create instant demo', `<form class="form">
    <label>School name<input name="name" required placeholder="Green Valley School"></label>
    <div class="row"><label>City<input name="city"></label><label>Contact person / phone<input name="contact"></label></div>
    <label>Books to show</label><div class="pick-books">${books.map((b) => `<label class="pick" style="--c:${esc(b.color)}"><input type="checkbox" name="book" value="${b.id}" checked><span>${esc(b.emoji)} ${esc(b.title)}</span></label>`).join('')}</div>
    <label>Demo length<select name="days">${[3, 7, 14, 30].map((d) => opt(d, `${d} days`, 7)).join('')}</select></label>
    <label>Notes<textarea name="notes" rows="2" placeholder="Met principal, interested in KG series"></textarea></label>
    <p class="muted small">Creates: school login, 1 teacher, 1 class, 2 students and 5 seats per book.</p>
    <div class="row end"><button class="btn green">✨ Create demo</button></div></form>`);
  const f = $('form', m.el);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f); d.book_ids = $$('input[name=book]:checked', f).map((i) => Number(i.value));
    const r = await act(e.submitter, () => api('/sales/demos', { body: d }));
    m.close(); showCredentials(d.name, r); onDone();
  };
}

export async function demosPage(main, _p, _q, ext = {}) {
  const demos = await api('/sales/demos');
  const now = new Date().toISOString();
  main.innerHTML = `<div class="page-head"><h1>🎁 Demo Schools</h1><button class="btn green" id="new">✨ New demo</button></div>
    ${demos.length ? `<div class="grid cards">${demos.map((d) => {
    const expired = d.is_demo && d.expires_at < now;
    return `<div class="card demo ${expired ? 'off' : ''}">
      <div class="row between"><h3>${esc(d.name)}</h3><span class="tag ${d.is_demo ? (expired ? 'red' : 'yellow') : 'green'}">${d.is_demo ? (expired ? '⌛ Expired' : 'Demo') : '✅ Customer'}</span></div>
      <p class="muted">Code <b class="code">${esc(d.code)}</b> ${d.city ? '· ' + esc(d.city) : ''} ${d.contact ? '· ' + esc(d.contact) : ''}</p>
      <p class="small">${d.books.map((b) => esc(b.emoji + ' ' + b.title)).join(', ')}</p>
      <p class="muted small">${d.is_demo ? `Expires ${fmtDate(d.expires_at)}` : 'Converted'} · created ${fmtDate(d.created_at)}${d.sales_name ? ' · 💼 ' + esc(d.sales_name) : ''}</p>
      ${d.notes ? `<p class="note">📝 ${esc(d.notes)}</p>` : ''}
      <div class="row">${d.is_demo ? `<select class="st" data-id="${d.id}">${Object.entries(STATUS).filter(([k]) => k !== 'converted').map(([k, v]) => opt(k, v, d.lead_status)).join('')}</select>` : ''}</div>
      <div class="row wrap">${d.is_demo ? `<button class="btn small blue ext" data-id="${d.id}">⏰ +7 days</button>
        <button class="btn small yellow rs" data-id="${d.id}">🔑 New passwords</button>` : ''}
        <button class="btn small ghost nt" data-id="${d.id}">📝 Notes</button>
        ${ext.extraButton ? ext.extraButton(d) : ''}
        ${d.is_demo ? `<button class="icon-btn del" data-id="${d.id}" title="Delete">🗑️</button>` : ''}</div></div>`;
  }).join('')}</div>` : '<div class="empty">No demos yet. Create one in 10 seconds and hand the logins to the school! 🚀</div>'}`;
  const reload = () => demosPage(main, _p, _q, ext);
  const find = (id) => demos.find((d) => d.id == id);
  $('#new').onclick = () => newDemo(reload);
  $$('.st', main).forEach((s) => { s.onchange = () => act(null, () => api(`/sales/demos/${s.dataset.id}`, { method: 'PUT', body: { lead_status: s.value } }), 'Status saved'); });
  $$('.ext', main).forEach((b) => { b.onclick = async () => { await act(b, () => api(`/sales/demos/${b.dataset.id}`, { method: 'PUT', body: { extend_days: 7 } }), 'Extended by 7 days ⏰'); reload(); }; });
  $$('.rs', main).forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmBox('Create new passwords for all logins of this demo? Old passwords stop working.'))) return;
      const r = await act(b, () => api(`/sales/demos/${b.dataset.id}/reset`, { method: 'POST' })); showCredentials(find(b.dataset.id).name, r);
    };
  });
  $$('.nt', main).forEach((b) => {
    b.onclick = () => {
      const d = find(b.dataset.id);
      const m = modal('📝 Notes', `<form class="form"><label>Contact<input name="contact" value="${esc(d.contact)}"></label>
        <label>Notes<textarea name="notes" rows="5">${esc(d.notes)}</textarea></label><div class="row end"><button class="btn green">💾 Save</button></div></form>`);
      $('form', m.el).onsubmit = async (e) => { e.preventDefault(); await act(e.submitter, () => api(`/sales/demos/${d.id}`, { method: 'PUT', body: formData(e.target) }), 'Saved'); m.close(); reload(); };
    };
  });
  $$('.del', main).forEach((b) => { b.onclick = async () => { if (await confirmBox('Delete this demo school and all its logins?')) { await api(`/sales/demos/${b.dataset.id}`, { method: 'DELETE' }); toast('Deleted'); reload(); } }; });
  ext.bind?.();
}

async function salesHome(main) {
  const demos = await api('/sales/demos');
  const now = new Date().toISOString();
  const count = (fn) => demos.filter(fn).length;
  main.innerHTML = `<div class="page-head"><h1>💼 Sales Desk</h1><button class="btn green" id="new">✨ New demo</button></div>
    <div class="grid tiles">
      <a class="tile yellow" href="#/demos"><span class="ti">🎁</span><b>${count((d) => d.is_demo && d.expires_at >= now)}</b><span>Running demos</span></a>
      <a class="tile blue" href="#/demos"><span class="ti">🤝</span><b>${count((d) => ['interested', 'negotiating'].includes(d.lead_status))}</b><span>Hot leads</span></a>
      <a class="tile green" href="#/demos"><span class="ti">✅</span><b>${count((d) => !d.is_demo)}</b><span>Converted</span></a>
      <a class="tile red" href="#/books"><span class="ti">📚</span><b>📖</b><span>Show catalogue</span></a></div>
    <div class="card"><h2>🎯 How to demo</h2><ol class="steps">
      <li>Open <a href="#/books">Catalogue</a> to show books, parts, resources and teaching files.</li>
      <li>Click <b>New demo</b> → choose the books → share the logins (copy for WhatsApp or print).</li>
      <li>The school tries it as principal, teacher and student (AI lesson plans, assignments and games included).</li>
      <li>Update the lead status. When they buy, the admin converts the demo into a customer.</li></ol></div>`;
  $('#new').onclick = () => newDemo(() => { location.hash = '#/demos'; });
}

export default [
  { path: '/home', label: 'Sales Desk', icon: '🏠', render: salesHome },
  { path: '/books', label: 'Catalogue', icon: '📚', render: booksPage },
  { path: '/demos', label: 'My Demos', icon: '🎁', render: demosPage },
];
