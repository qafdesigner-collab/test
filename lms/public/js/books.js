// Book catalogue + book detail page (shared by all roles; admin gets edit tools).
import { api, esc, $, $$, modal, toast, act, confirmBox, openMaterial, fileIcon, fmtSize, KIND, RESOURCE_TYPES, opt, state, formData } from './core.js';

export async function loadBooks(force) {
  if (!state.books || force) state.books = await api('/books');
  return state.books;
}

export function bookCard(b) {
  const parts = b.components.filter((c) => c.kind === 'part').length;
  const res = b.components.filter((c) => c.kind === 'resource').length;
  return `<a class="book-card" href="#/book/${b.id}" style="--c:${esc(b.color)}">
    <div class="book-spine"></div>
    <div class="book-emoji">${esc(b.emoji)}</div>
    <div class="book-title">${esc(b.title)}</div>
    <div class="book-meta">${esc(b.subject)} · ${esc(b.level)}</div>
    <div class="chips"><span class="chip">${parts} parts</span>${b.components.some((c) => c.kind === 'homework') ? '<span class="chip">homework</span>' : ''}
    ${res ? `<span class="chip">${res} resources</span>` : ''}<span class="chip">${b.materials.length} files</span></div>
  </a>`;
}

export async function booksPage(main) {
  const books = await loadBooks(true);
  const isAdmin = state.user.role === 'admin';
  main.innerHTML = `<div class="page-head"><h1>📚 ${state.user.role === 'student' ? 'My Books' : 'Books'}</h1>
    ${isAdmin ? '<button class="btn green" id="newBook">➕ New book</button>' : ''}</div>
    ${books.length ? `<div class="grid books">${books.map(bookCard).join('')}</div>`
    : `<div class="empty">🙈 No books yet. ${isAdmin ? 'Create your first book!' : 'Ask your school to assign books.'}</div>`}`;
  if (isAdmin) $('#newBook').onclick = () => editBook(null);
}

export function editBook(book) {
  const b = book || { color: '#ff6b6b', emoji: '📘' };
  const colors = ['#ff6b6b', '#ff922b', '#fcc419', '#51cf66', '#20c997', '#4dabf7', '#748ffc', '#cc5de8', '#f06595'];
  const m = modal(book ? '✏️ Edit book' : '📘 New book', `<form class="form">
    <label>Title<input name="title" required value="${esc(b.title)}" placeholder="KG English"></label>
    <div class="row"><label>Subject<input name="subject" value="${esc(b.subject)}" placeholder="English"></label>
    <label>Level / Class<input name="level" value="${esc(b.level)}" placeholder="KG, Nursery, Grade 1"></label></div>
    <label>Description<textarea name="description" rows="2">${esc(b.description)}</textarea></label>
    <div class="row"><label>Emoji<input name="emoji" value="${esc(b.emoji)}" maxlength="8"></label>
    <label>Colour<div class="swatches">${colors.map((c) => `<label class="swatch" style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === b.color ? 'checked' : ''}></label>`).join('')}</div></label></div>
    <label>Vocabulary words <small>(comma separated — used by games &amp; AI)</small>
      <textarea name="vocabulary" rows="3" placeholder="apple, ball, cat, dog">${esc(b.vocabulary)}</textarea></label>
    ${book ? '' : '<label class="check"><input type="checkbox" name="default_structure" checked> Create Part 1, Part 2, Part 3 + Homework Book automatically</label>'}
    <div class="row end"><button class="btn green">💾 Save</button></div></form>`);
  $('form', m.el).onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(e.target); d.default_structure = !!d.default_structure;
    const r = await act(e.submitter, () => (book ? api(`/admin/books/${book.id}`, { method: 'PUT', body: d }) : api('/admin/books', { body: d })), 'Saved ✅');
    m.close();
    location.hash = `#/book/${book ? book.id : r.id}`;
    if (book) bookPage($('#main'), { id: book.id });
  };
}

function editComponent(book, comp) {
  const c = comp || { kind: 'resource', resource_type: 'flashcard' };
  const m = modal(comp ? '✏️ Edit section' : '➕ Add part / homework / resource', `<form class="form">
    <div class="row"><label>Type<select name="kind">${Object.entries(KIND).map(([k, v]) => opt(k, v, c.kind)).join('')}</select></label>
    <label class="rt">Resource type<select name="resource_type">${Object.entries(RESOURCE_TYPES).map(([k, v]) => opt(k, v, c.resource_type)).join('')}</select></label></div>
    <label>Title<input name="title" required value="${esc(c.title)}" placeholder="Part 1 / Flash Cards Set A"></label>
    <label>Topics / contents <small>(helps the AI)</small><textarea name="topics" rows="3">${esc(c.topics)}</textarea></label>
    <label>Order<input type="number" name="sort" value="${esc(c.sort ?? '')}"></label>
    <div class="row end"><button class="btn green">💾 Save</button></div></form>`);
  const f = $('form', m.el);
  const sync = () => { $('.rt', f).style.display = f.kind.value === 'resource' ? '' : 'none'; };
  f.kind.onchange = sync; sync();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f); if (d.kind !== 'resource') d.resource_type = ''; if (d.sort === '') delete d.sort;
    await act(e.submitter, () => (comp ? api(`/admin/components/${comp.id}`, { method: 'PUT', body: d }) : api(`/admin/books/${book.id}/components`, { body: d })), 'Saved ✅');
    m.close(); bookPage($('#main'), { id: book.id });
  };
}

function uploadFiles(book, compId) {
  const m = modal('⬆️ Upload teaching material', `<form class="form">
    <label>Section<select name="component_id"><option value="">— Whole book —</option>
      ${book.components.map((c) => opt(c.id, `${KIND[c.kind]}: ${c.title}`, compId)).join('')}</select></label>
    <label>Title <small>(optional, for a single file)</small><input name="title"></label>
    <label>Who can see it?<select name="audience">${opt('all', '👨‍👩‍👧 Teachers & students')}${opt('teacher', '👩‍🏫 Teachers only')}</select></label>
    <label class="drop">📂 Choose files — PPT, PDF, Word, Excel, HTML, images, audio, video
      <input type="file" name="files" multiple required accept=".pdf,.ppt,.pptx,.pps,.ppsx,.doc,.docx,.xls,.xlsx,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.svg,.mp3,.wav,.mp4,.webm,.txt,.zip"></label>
    <div class="progress" hidden><div></div></div>
    <div class="row end"><button class="btn blue">⬆️ Upload</button></div></form>`);
  const f = $('form', m.el);
  f.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(f); fd.append('book_id', book.id);
    const xhr = new XMLHttpRequest(); const bar = $('.progress', f);
    bar.hidden = false; e.submitter.disabled = true;
    xhr.upload.onprogress = (ev) => { bar.firstElementChild.style.width = (ev.loaded / ev.total) * 100 + '%'; };
    xhr.onload = () => {
      e.submitter.disabled = false;
      let r = {}; try { r = JSON.parse(xhr.responseText); } catch { /* */ }
      if (xhr.status >= 300) return toast(r.error || 'Upload failed', 'err');
      toast(`Uploaded ${r.ids.length} file(s) 🎉`); m.close(); bookPage($('#main'), { id: book.id });
    };
    xhr.onerror = () => { e.submitter.disabled = false; toast('Upload failed', 'err'); };
    xhr.open('POST', '/api/admin/materials'); xhr.send(fd);
  };
}

function editMaterial(book, mat) {
  const m = modal('✏️ Edit file', `<form class="form">
    <label>Title<input name="title" value="${esc(mat.title)}"></label>
    <label>Section<select name="component_id"><option value="">— Whole book —</option>
      ${book.components.map((c) => opt(c.id, `${KIND[c.kind]}: ${c.title}`, mat.component_id)).join('')}</select></label>
    <label>Who can see it?<select name="audience">${opt('all', '👨‍👩‍👧 Teachers & students', mat.audience)}${opt('teacher', '👩‍🏫 Teachers only', mat.audience)}</select></label>
    <div class="row end"><button type="button" class="btn red del">🗑️ Delete</button><button class="btn green">💾 Save</button></div></form>`);
  const f = $('form', m.el);
  f.onsubmit = async (e) => { e.preventDefault(); await act(e.submitter, () => api(`/admin/materials/${mat.id}`, { method: 'PUT', body: formData(f) }), 'Saved ✅'); m.close(); bookPage($('#main'), { id: book.id }); };
  $('.del', f).onclick = async () => { if (await confirmBox(`Delete "${mat.title}"?`)) { await api(`/admin/materials/${mat.id}`, { method: 'DELETE' }); m.close(); bookPage($('#main'), { id: book.id }); } };
}

export async function bookPage(main, { id }) {
  const b = await api(`/books/${id}`);
  const role = state.user.role; const isAdmin = role === 'admin'; const isTeacher = role === 'teacher';
  const section = (c) => {
    const mats = b.materials.filter((m) => m.component_id === c.id);
    const label = c.kind === 'resource' ? (RESOURCE_TYPES[c.resource_type] || '🎁 Resource') : KIND[c.kind];
    return `<div class="section-card kind-${c.kind}">
      <div class="section-head"><div><span class="tag">${label}</span><h3>${esc(c.title)}</h3>${c.topics ? `<p class="muted">${esc(c.topics)}</p>` : ''}</div>
        <div class="row">
        ${isTeacher ? `<a class="btn small purple" href="#/plans/new?book=${b.id}&comp=${c.id}">✨ AI lesson plan</a>
          <a class="btn small orange" href="#/assignments/new?book=${b.id}&comp=${c.id}">✨ AI questions</a>` : ''}
        ${isAdmin ? `<button class="btn small blue up" data-c="${c.id}">⬆️ Upload</button><button class="icon-btn ec" data-c="${c.id}" title="Edit">✏️</button><button class="icon-btn dc" data-c="${c.id}" title="Delete">🗑️</button>` : ''}
        </div></div>
      ${mats.length ? `<div class="files">${mats.map(fileTile).join('')}</div>` : `<p class="muted small">${isAdmin ? 'No files yet — upload PPT, PDF, Word, HTML…' : 'No files yet.'}</p>`}
    </div>`;
  };
  const fileTile = (m) => `<div class="file" data-m="${m.id}"><button class="file-open" data-m="${m.id}"><span class="fi">${fileIcon(m.original_name)}</span>
    <span class="fn">${esc(m.title)}</span><span class="muted small">${fmtSize(m.size || 0)}${m.audience === 'teacher' ? ' · 👩‍🏫 teachers' : ''}</span></button>
    ${isAdmin ? `<button class="icon-btn em" data-m="${m.id}" title="Edit">✏️</button>` : ''}</div>`;
  const loose = b.materials.filter((m) => !m.component_id || !b.components.some((c) => c.id === m.component_id));
  const groups = [['part', '📗 Book Parts'], ['homework', '📝 Homework Book'], ['resource', '🎁 Resources']];
  main.innerHTML = `<a class="back" href="#/books">← All books</a>
    <div class="book-hero" style="--c:${esc(b.color)}"><div class="book-emoji big">${esc(b.emoji)}</div>
      <div><h1>${esc(b.title)}</h1><p>${esc(b.subject)} · ${esc(b.level)}</p><p>${esc(b.description)}</p>
      ${b.vocabulary ? `<div class="chips">${b.vocabulary.split(',').slice(0, 30).map((w) => `<span class="chip light">${esc(w.trim())}</span>`).join('')}</div>` : ''}</div>
      ${isAdmin ? `<div class="hero-actions"><button class="btn white" id="eb">✏️ Edit book</button><button class="btn white" id="ac">➕ Add section</button>
        <button class="btn white" id="ub">⬆️ Upload files</button><button class="btn white" id="db">🗑️ Delete</button></div>` : ''}
      ${role === 'student' ? `<div class="hero-actions"><a class="btn white" href="#/games?book=${b.id}">🎮 Play games with this book</a></div>` : ''}
    </div>
    ${groups.map(([k, title]) => { const cs = b.components.filter((c) => c.kind === k); return cs.length ? `<h2 class="group-title">${title}</h2>${cs.map(section).join('')}` : ''; }).join('')}
    ${loose.length ? `<h2 class="group-title">📦 Other material</h2><div class="section-card"><div class="files">${loose.map(fileTile).join('')}</div></div>` : ''}`;

  $$('.file-open', main).forEach((el) => { el.onclick = () => openMaterial(b.materials.find((m) => m.id == el.dataset.m)); });
  if (!isAdmin) return;
  $('#eb').onclick = () => editBook(b);
  $('#ac').onclick = () => editComponent(b, null);
  $('#ub').onclick = () => uploadFiles(b, null);
  $('#db').onclick = async () => {
    if (await confirmBox(`Delete the whole book "${b.title}" with all its files and licences?`)) { await api(`/admin/books/${b.id}`, { method: 'DELETE' }); toast('Book deleted'); location.hash = '#/books'; }
  };
  $$('.up', main).forEach((el) => { el.onclick = () => uploadFiles(b, el.dataset.c); });
  $$('.ec', main).forEach((el) => { el.onclick = () => editComponent(b, b.components.find((c) => c.id == el.dataset.c)); });
  $$('.dc', main).forEach((el) => {
    el.onclick = async () => { if (await confirmBox('Delete this section? Its files will move to "Other material".')) { await api(`/admin/components/${el.dataset.c}`, { method: 'DELETE' }); bookPage(main, { id }); } };
  });
  $$('.em', main).forEach((el) => { el.onclick = () => editMaterial(b, b.materials.find((m) => m.id == el.dataset.m)); });
}
