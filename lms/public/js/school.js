// School admin: overview with licence usage, teachers, classes, students (incl. bulk create).
import { api, esc, $, $$, modal, act, confirmBox, toast, opt, formData, printHTML, credentialsHTML, state } from './core.js';
import { booksPage } from './books.js';
import { seatBar } from './admin.js';

async function overview(main) {
  const o = await api('/school/overview');
  main.innerHTML = `<div class="page-head"><h1>🏫 ${esc(o.school.name)}</h1><span class="tag">Code <b>${esc(o.school.code)}</b></span></div>
    <div class="grid tiles">
      <a class="tile green" href="#/teachers"><span class="ti">👩‍🏫</span><b>${o.teachers}</b><span>Teachers</span></a>
      <a class="tile blue" href="#/classes"><span class="ti">🏷️</span><b>${o.classes}</b><span>Classes</span></a>
      <a class="tile purple" href="#/students"><span class="ti">🧒</span><b>${o.students}</b><span>Students</span></a>
      <a class="tile red" href="#/books"><span class="ti">📚</span><b>${o.licenses.length}</b><span>Books</span></a></div>
    <div class="card"><h2>🎟️ Licences (seats used / purchased)</h2>${o.licenses.map(seatBar).join('') || '<p class="muted">No books licensed yet — contact the publisher.</p>'}</div>
    <div class="card"><h2>🧭 Setup steps</h2><ol class="steps"><li><a href="#/teachers">Add teachers</a></li>
      <li><a href="#/classes">Create classes</a>, choose the class teacher and books</li><li><a href="#/students">Add students</a> (paste a whole list at once!) and print their login cards</li></ol></div>`;
}

async function teachersPage(main) {
  const list = await api('/school/teachers');
  main.innerHTML = `<div class="page-head"><h1>👩‍🏫 Teachers</h1><button class="btn green" id="add">➕ Add teacher</button></div>
    <table class="table"><thead><tr><th></th><th>Name</th><th>Username</th><th>Classes</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map((t) => `<tr><td>${esc(t.avatar)}</td><td>${esc(t.name)}</td><td>${esc(t.username)}</td><td>${esc(t.classes || '—')}</td>
    <td>${t.active ? '<span class="tag green">Active</span>' : '<span class="tag red">Off</span>'}</td>
    <td class="right"><button class="btn small blue ed" data-id="${t.id}">✏️</button> <button class="icon-btn del" data-id="${t.id}">🗑️</button></td></tr>`).join('')
    || '<tr><td colspan="6" class="muted">No teachers yet.</td></tr>'}</tbody></table>`;
  const edit = (t) => {
    const m = modal(t ? '✏️ Teacher' : '👩‍🏫 New teacher', `<form class="form">
      <label>Name<input name="name" required value="${esc(t?.name)}"></label>
      <label>Username<input name="username" ${t ? 'disabled' : 'required'} value="${esc(t?.username)}"></label>
      <label>${t ? 'New password (optional)' : 'Password'}<input name="password" ${t ? '' : 'required'}></label>
      ${t ? `<label class="check"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> Active</label>` : ''}
      <div class="row end"><button class="btn green">💾 Save</button></div></form>`);
    $('form', m.el).onsubmit = async (e) => {
      e.preventDefault(); const d = formData(e.target);
      if (t) { d.active = !!d.active; if (!d.password) delete d.password; }
      await act(e.submitter, () => (t ? api(`/school/teachers/${t.id}`, { method: 'PUT', body: d }) : api('/school/teachers', { body: d })), 'Saved ✅');
      m.close(); teachersPage(main);
    };
  };
  $('#add').onclick = () => edit(null);
  $$('.ed', main).forEach((b) => { b.onclick = () => edit(list.find((t) => t.id == b.dataset.id)); });
  $$('.del', main).forEach((b) => { b.onclick = async () => { if (await confirmBox('Delete this teacher? Their lesson plans and assignments are removed too.')) { await api(`/school/teachers/${b.dataset.id}`, { method: 'DELETE' }); teachersPage(main); } }; });
}

async function classesPage(main) {
  const [classes, teachers, ov] = await Promise.all([api('/school/classes'), api('/school/teachers'), api('/school/overview')]);
  const bookName = (id) => { const l = ov.licenses.find((x) => x.book_id === id); return l ? `${l.emoji} ${l.title}` : '?'; };
  main.innerHTML = `<div class="page-head"><h1>🏷️ Classes</h1><button class="btn green" id="add">➕ Add class</button></div>
    ${classes.length ? `<div class="grid cards">${classes.map((c) => `<div class="card"><div class="row between"><h3>${esc(c.name)}</h3><span class="tag">🧒 ${c.students}</span></div>
      <p>👩‍🏫 ${esc(c.teacher_name || 'No teacher yet')}</p><p class="small">${c.book_ids.map((b) => esc(bookName(b))).join(', ') || '<span class="muted">No books</span>'}</p>
      <div class="row"><a class="btn small purple" href="#/students?class=${c.id}">🧒 Students</a><button class="btn small blue ed" data-id="${c.id}">✏️ Edit</button><button class="icon-btn del" data-id="${c.id}">🗑️</button></div></div>`).join('')}</div>`
    : '<div class="empty">No classes yet. Create one like "KG - Rose" 🌹</div>'}`;
  const edit = (c) => {
    const m = modal(c ? '✏️ Class' : '🏷️ New class', `<form class="form">
      <label>Class name<input name="name" required value="${esc(c?.name)}" placeholder="KG - Rose"></label>
      <label>Class teacher<select name="teacher_id"><option value="">— none —</option>${teachers.map((t) => opt(t.id, t.name, c?.teacher_id)).join('')}</select></label>
      <label>Books for this class</label><div class="pick-books">${ov.licenses.map((l) => `<label class="pick" style="--c:${esc(l.color)}"><input type="checkbox" name="book" value="${l.book_id}" ${c?.book_ids.includes(l.book_id) ? 'checked' : ''}><span>${esc(l.emoji)} ${esc(l.title)} <small>(${l.used}/${l.seats})</small></span></label>`).join('') || '<p class="muted">No licensed books.</p>'}</div>
      <div class="row end"><button class="btn green">💾 Save</button></div></form>`);
    const f = $('form', m.el);
    f.onsubmit = async (e) => {
      e.preventDefault(); const d = formData(f); d.book_ids = $$('input[name=book]:checked', f).map((i) => Number(i.value));
      await act(e.submitter, () => (c ? api(`/school/classes/${c.id}`, { method: 'PUT', body: d }) : api('/school/classes', { body: d })), 'Saved ✅');
      m.close(); classesPage(main);
    };
  };
  $('#add').onclick = () => edit(null);
  $$('.ed', main).forEach((b) => { b.onclick = () => edit(classes.find((c) => c.id == b.dataset.id)); });
  $$('.del', main).forEach((b) => { b.onclick = async () => { if (await confirmBox('Delete this class? Students stay but lose the class.')) { await api(`/school/classes/${b.dataset.id}`, { method: 'DELETE' }); classesPage(main); } }; });
}

async function studentsPage(main, _p, q) {
  const [students, classes] = await Promise.all([api('/school/students'), api('/school/classes')]);
  const filter = q.class || '';
  const shown = filter ? students.filter((s) => String(s.class_id) === filter) : students;
  main.innerHTML = `<div class="page-head"><h1>🧒 Students</h1><div class="row">
      <button class="btn purple" id="bulk">📋 Add many</button><button class="btn green" id="add">➕ Add one</button></div></div>
    <div class="row"><label class="inline">Class <select id="cf"><option value="">All classes</option>${classes.map((c) => opt(c.id, c.name, filter)).join('')}</select></label>
      <span class="muted">${shown.length} students</span></div>
    <table class="table"><thead><tr><th></th><th>Name</th><th>Username</th><th>Class</th><th>⭐</th><th></th></tr></thead><tbody>
    ${shown.map((s) => `<tr class="${s.active ? '' : 'off'}"><td>${esc(s.avatar)}</td><td>${esc(s.name)}</td><td>${esc(s.username)}</td><td>${esc(s.class_name || '—')}</td><td>${s.stars}</td>
      <td class="right"><button class="btn small blue ed" data-id="${s.id}">✏️</button> <button class="icon-btn del" data-id="${s.id}">🗑️</button></td></tr>`).join('')
    || '<tr><td colspan="6" class="muted">No students yet.</td></tr>'}</tbody></table>`;
  $('#cf').onchange = (e) => { location.hash = `#/students${e.target.value ? '?class=' + e.target.value : ''}`; };
  const edit = (s) => {
    const m = modal(s ? '✏️ Student' : '🧒 New student', `<form class="form">
      <label>Name<input name="name" required value="${esc(s?.name)}"></label>
      <div class="row"><label>Username<input name="username" ${s ? 'disabled' : 'required'} value="${esc(s?.username)}"></label>
      <label>${s ? 'New password (optional)' : 'Password'}<input name="password" ${s ? '' : 'required'}></label></div>
      <label>Class<select name="class_id"><option value="">— none —</option>${classes.map((c) => opt(c.id, c.name, s?.class_id ?? filter)).join('')}</select></label>
      ${s ? `<label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Active</label>` : ''}
      <div class="row end"><button class="btn green">💾 Save</button></div></form>`);
    $('form', m.el).onsubmit = async (e) => {
      e.preventDefault(); const d = formData(e.target);
      if (s) { d.active = !!d.active; if (!d.password) delete d.password; }
      await act(e.submitter, () => (s ? api(`/school/students/${s.id}`, { method: 'PUT', body: d }) : api('/school/students', { body: d })), 'Saved ✅');
      m.close(); studentsPage(main, _p, q);
    };
  };
  $('#add').onclick = () => edit(null);
  $$('.ed', main).forEach((b) => { b.onclick = () => edit(students.find((s) => s.id == b.dataset.id)); });
  $$('.del', main).forEach((b) => { b.onclick = async () => { if (await confirmBox('Delete this student and all their results?')) { await api(`/school/students/${b.dataset.id}`, { method: 'DELETE' }); studentsPage(main, _p, q); } }; });
  $('#bulk').onclick = () => {
    const m = modal('📋 Add many students', `<form class="form">
      <label>Class<select name="class_id" required><option value="">Choose…</option>${classes.map((c) => opt(c.id, c.name, filter)).join('')}</select></label>
      <label>Student names — one per line<textarea name="names" rows="10" required placeholder="Ali Khan&#10;Sara Ahmed&#10;Zain Malik"></textarea></label>
      <label>Username prefix <small>(optional, e.g. "kgrose" → kgrose1, kgrose2…)</small><input name="prefix"></label>
      <div class="row end"><button class="btn green">✨ Create logins</button></div></form>`);
    $('form', m.el).onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const r = await act(e.submitter, () => api('/school/students/bulk', { body: d }));
      m.close(); toast(`Created ${r.created.length} students 🎉`);
      const cls = classes.find((c) => c.id == d.class_id)?.name || '';
      const cards = r.created.map((c) => `<div class="card"><b>${esc(c.name)}</b><br>School code: <b>${esc(state.user.school.code)}</b><br>Username: <b>${esc(c.username)}</b><br>Password: <b>${esc(c.password)}</b></div>`).join('');
      const m2 = modal('🎟️ Login cards', `<p>Passwords are shown only now — print the cards and give one to each child.</p>
        <div class="cred-box">${credentialsHTML(cls, state.user.school.code, r.created.map((c) => ({ ...c, role: 'student' })))}</div>
        <div class="row end"><button class="btn yellow pr">🖨️ Print login cards</button></div>`, { wide: true, onClose: () => studentsPage(main, _p, q) });
      $('.pr', m2.el).onclick = () => printHTML('Login cards', `<h1>${esc(state.user.school.name)} · ${esc(cls)}</h1><p>Website: ${esc(location.origin)}</p>${cards}`);
    };
  };
}

export default [
  { path: '/overview', label: 'Overview', icon: '🏠', render: overview },
  { path: '/teachers', label: 'Teachers', icon: '👩‍🏫', render: teachersPage },
  { path: '/classes', label: 'Classes', icon: '🏷️', render: classesPage },
  { path: '/students', label: 'Students', icon: '🧒', render: studentsPage },
  { path: '/books', label: 'Books', icon: '📚', render: booksPage },
];
