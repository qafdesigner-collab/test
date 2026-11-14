// Teacher: classes, books, AI lesson plans, AI assignments, marking, evaluation.
import { api, esc, $, $$, modal, act, confirmBox, toast, opt, formData, fmtDate, printHTML, state, stars, KIND } from './core.js';
import { booksPage, loadBooks } from './books.js';

const aiBadge = () => `<span class="tag purple" title="AI provider">✨ AI: ${state.ai === 'offline' ? 'built-in (free, offline)' : esc(state.ai)}</span>`;

async function home(main) {
  const [classes, plans, asg] = await Promise.all([api('/teacher/classes'), api('/teacher/plans'), api('/teacher/assignments')]);
  main.innerHTML = `<div class="page-head"><h1>${esc(state.user.avatar)} Hello, ${esc(state.user.name)}!</h1></div>
    <div class="grid tiles">
      <a class="tile purple" href="#/plans/new"><span class="ti">✨</span><b>AI</b><span>New lesson plan</span></a>
      <a class="tile orange" href="#/assignments/new"><span class="ti">📝</span><b>AI</b><span>New assignment</span></a>
      <a class="tile blue" href="#/plans"><span class="ti">🗓️</span><b>${plans.length}</b><span>Lesson plans</span></a>
      <a class="tile green" href="#/assignments"><span class="ti">✅</span><b>${asg.length}</b><span>Assignments</span></a></div>
    ${classes.map((c) => `<div class="card"><div class="row between"><h2>🏷️ ${esc(c.name)}</h2><a class="btn small blue" href="#/students?class=${c.id}">📊 Evaluate</a></div>
      <div class="chips">${c.books.map((b) => `<a class="chip big" style="background:${esc(b.color)}" href="#/book/${b.id}">${esc(b.emoji)} ${esc(b.title)}</a>`).join('') || '<span class="muted">No books assigned</span>'}</div>
      <div class="kids">${c.students.map((s) => `<span class="kid">${esc(s.avatar)} ${esc(s.name)} <small>⭐${s.stars}</small></span>`).join('') || '<span class="muted">No students yet</span>'}</div></div>`).join('')
    || '<div class="empty">You have no classes yet — ask your school admin to assign you to a class. 🙂</div>'}`;
}

// ---------- Book / section picker used by AI forms ----------
async function bookPicker(form, bookId, compId) {
  const books = await loadBooks();
  form.querySelector('.bp').innerHTML = `<div class="row"><label>Book<select name="book_id" required><option value="">Choose…</option>${books.map((b) => opt(b.id, `${b.emoji} ${b.title}`, bookId)).join('')}</select></label>
    <label>Part / section<select name="component_id"></select></label></div>`;
  const fill = () => {
    const b = books.find((x) => x.id == form.book_id.value);
    form.component_id.innerHTML = '<option value="">Whole book</option>' + (b ? b.components.map((c) => opt(c.id, `${KIND[c.kind]}: ${c.title}`, compId)).join('') : '');
  };
  form.book_id.onchange = () => { compId = null; fill(); };
  fill();
}

// ---------- Lesson plans ----------
async function plansPage(main) {
  const plans = await api('/teacher/plans');
  main.innerHTML = `<div class="page-head"><h1>🗓️ Lesson Plans</h1><a class="btn purple" href="#/plans/new">✨ New plan</a></div>
    ${plans.length ? `<div class="grid cards">${plans.map((p) => `<a class="card link" href="#/plans/${p.id}">
      <div class="row between"><h3>${esc(p.title)}</h3>${p.ai ? '<span class="tag purple">✨ AI</span>' : ''}</div>
      <p class="muted">${esc(p.book_title || '')} ${p.component_title ? '· ' + esc(p.component_title) : ''} ${p.class_name ? '· ' + esc(p.class_name) : ''}</p>
      <p class="small">📅 ${esc(p.plan_date || fmtDate(p.created_at))}</p></a>`).join('')}</div>`
    : '<div class="empty">No plans yet. Let AI write your first lesson plan in seconds! ✨</div>'}`;
}

async function planEditor(main, { id }, q) {
  const classes = await api('/teacher/classes');
  const plan = id === 'new' ? { title: '', plan_date: new Date().toISOString().slice(0, 10), content: '', book_id: q.book, component_id: q.comp, ai: 0 }
    : (await api('/teacher/plans')).find((p) => p.id == id);
  if (!plan) throw new Error('Plan not found');
  main.innerHTML = `<a class="back" href="#/plans">← Lesson plans</a>
    <div class="page-head"><h1>${id === 'new' ? '✨ New lesson plan' : '✏️ ' + esc(plan.title)}</h1>${aiBadge()}</div>
    <form class="card form" id="pf">
      <div class="bp"></div>
      <div class="row"><label>Topic<input name="topic" placeholder="e.g. Letter A, colours, counting to 5"></label>
        <label>Duration (min)<input type="number" name="duration" value="40" min="10" max="120"></label></div>
      <label>Extra instructions for AI <small>(optional)</small><input name="extra" placeholder="25 kids, include a song, low-cost materials"></label>
      <div class="row"><button type="button" class="btn purple big" id="gen">✨ Generate with AI</button></div>
      <hr>
      <div class="row"><label>Plan title<input name="title" required value="${esc(plan.title)}"></label>
        <label>Date<input type="date" name="plan_date" value="${esc(plan.plan_date)}"></label>
        <label>Class<select name="class_id"><option value="">—</option>${classes.map((c) => opt(c.id, c.name, plan.class_id)).join('')}</select></label></div>
      <label>Lesson plan<textarea name="content" rows="18" class="mono">${esc(plan.content)}</textarea></label>
      <div class="row end">${id !== 'new' ? '<button type="button" class="btn red" id="del">🗑️ Delete</button><button type="button" class="btn yellow" id="pr">🖨️ Print</button>' : ''}
        <button class="btn green">💾 Save plan</button></div>
    </form>`;
  const f = $('#pf');
  await bookPicker(f, plan.book_id, plan.component_id);
  let usedAI = !!plan.ai;
  $('#gen').onclick = async (e) => {
    if (!f.book_id.value) return toast('Choose a book first 📚', 'err');
    const d = formData(f);
    const r = await act(e.currentTarget, () => api('/teacher/ai/lesson-plan', { body: d }));
    f.content.value = r.text; usedAI = true;
    if (!f.title.value) f.title.value = d.topic || f.component_id.selectedOptions[0]?.text.replace(/^.*?: /, '') || 'Lesson plan';
    toast('Plan ready! Edit anything you like ✏️');
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f); d.ai = usedAI;
    await act(e.submitter, () => (id === 'new' ? api('/teacher/plans', { body: d }) : api(`/teacher/plans/${id}`, { method: 'PUT', body: d })), 'Saved ✅');
    location.hash = '#/plans';
  };
  if (id !== 'new') {
    $('#del').onclick = async () => { if (await confirmBox('Delete this plan?')) { await api(`/teacher/plans/${id}`, { method: 'DELETE' }); location.hash = '#/plans'; } };
    $('#pr').onclick = () => printHTML(plan.title, `<h1>${esc(f.title.value)}</h1><p>${esc(f.plan_date.value)}</p><pre>${esc(f.content.value)}</pre>`);
  }
}

// ---------- Assignments ----------
async function assignmentsPage(main) {
  const list = await api('/teacher/assignments');
  main.innerHTML = `<div class="page-head"><h1>✅ Assignments</h1><a class="btn orange" href="#/assignments/new">✨ New assignment</a></div>
    ${list.length ? `<table class="table"><thead><tr><th>Title</th><th>Class</th><th>Book</th><th>Questions</th><th>Submitted</th><th>Due</th></tr></thead><tbody>
    ${list.map((a) => `<tr class="clickable" data-id="${a.id}"><td><b>${esc(a.title)}</b></td><td>${esc(a.class_name)}</td><td>${esc(a.book_title || '')}</td>
      <td>${a.question_count}</td><td>${a.submitted}/${a.total}</td><td>${esc(a.due_date)}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">No assignments yet. Let AI make questions from your book! ✨</div>'}`;
  $$('tr.clickable', main).forEach((tr) => { tr.onclick = () => { location.hash = `#/assignments/${tr.dataset.id}`; }; });
}

function questionEditor(container, questions) {
  const draw = () => {
    container.innerHTML = questions.map((q, i) => `<div class="q-edit" data-i="${i}">
      <div class="row between"><b>Q${i + 1}</b><div class="row"><select class="qt">${opt('mcq', '🔘 Multiple choice', q.type)}${opt('tf', '✔️ True / False', q.type)}${opt('short', '✍️ Short answer', q.type)}</select>
        <button type="button" class="icon-btn qd" title="Remove">🗑️</button></div></div>
      <input class="qq" value="${esc(q.q)}" placeholder="Question">
      ${q.type === 'mcq' ? `<textarea class="qo" rows="3" placeholder="One option per line">${esc((q.options || []).join('\n'))}</textarea>
        <label class="inline">Correct answer <select class="qa">${(q.options || []).map((o) => opt(o, o, q.answer)).join('')}</select></label>`
      : q.type === 'tf' ? `<label class="inline">Correct answer <select class="qa">${opt('True', 'True', q.answer)}${opt('False', 'False', q.answer)}</select></label>`
        : `<label class="inline">Expected answer <small>(optional — leave empty to mark by hand)</small> <input class="qa" value="${esc(q.answer)}"></label>`}
    </div>`).join('') || '<p class="muted">No questions yet.</p>';
    $$('.q-edit', container).forEach((el) => {
      const q = questions[el.dataset.i];
      $('.qq', el).oninput = (e) => { q.q = e.target.value; };
      $('.qt', el).onchange = (e) => { q.type = e.target.value; if (q.type === 'tf') { q.options = ['True', 'False']; q.answer = 'True'; } else if (q.type === 'mcq' && (!q.options || q.options[0] === 'True')) q.options = ['', '', '']; draw(); };
      $('.qd', el).onclick = () => { questions.splice(el.dataset.i, 1); draw(); };
      const qo = $('.qo', el);
      if (qo) qo.onchange = (e) => { q.options = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); if (!q.options.includes(q.answer)) q.answer = q.options[0] || ''; draw(); };
      const qa = $('.qa', el); qa.onchange = qa.oninput = (e) => { q.answer = e.target.value; };
    });
  };
  draw();
  return draw;
}

async function newAssignment(main, _p, q) {
  const classes = await api('/teacher/classes');
  const questions = [];
  main.innerHTML = `<a class="back" href="#/assignments">← Assignments</a>
    <div class="page-head"><h1>✨ New assignment</h1>${aiBadge()}</div>
    <form class="card form" id="af">
      <div class="row"><label>Title<input name="title" required placeholder="Letter fun quiz"></label>
        <label>Class<select name="class_id" required>${classes.map((c) => opt(c.id, c.name)).join('')}</select></label>
        <label>Due date<input type="date" name="due_date"></label></div>
      <div class="bp"></div>
      <label>Instructions for children<input name="instructions" placeholder="Listen carefully and choose the right answer!"></label>
      <div class="ai-box"><h3>✨ Make questions with AI</h3>
        <div class="row"><label>Topic<input name="topic" placeholder="e.g. letters A–E"></label><label>How many<input type="number" name="count" value="5" min="1" max="20"></label></div>
        <label>Extra instructions <small>(optional)</small><input name="extra" placeholder="very easy, use pictures words"></label>
        <button type="button" class="btn purple" id="gen">✨ Generate questions</button></div>
      <h3>Questions</h3><div id="qs"></div>
      <div class="row"><button type="button" class="btn ghost" id="addq">➕ Add question</button></div>
      <div class="row end"><button class="btn green big">📤 Assign to class</button></div></form>`;
  if (!classes.length) { main.querySelector('#af').innerHTML = '<div class="empty">You need a class first.</div>'; return; }
  const f = $('#af');
  await bookPicker(f, q.book, q.comp);
  const draw = questionEditor($('#qs'), questions);
  $('#addq').onclick = () => { questions.push({ q: '', type: 'mcq', options: ['', '', ''], answer: '' }); draw(); };
  $('#gen').onclick = async (e) => {
    if (!f.book_id.value) return toast('Choose a book first 📚', 'err');
    const r = await act(e.currentTarget, () => api('/teacher/ai/questions', { body: formData(f) }));
    questions.push(...r.questions); draw();
    if (!f.title.value) f.title.value = (f.topic.value || 'Fun quiz') + ' ✨';
    toast(`${r.questions.length} questions added — review & edit ✏️`);
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const clean = questions.filter((x) => x.q.trim());
    if (!clean.length) return toast('Add at least one question', 'err');
    const d = formData(f); d.questions = clean;
    const r = await act(e.submitter, () => api('/teacher/assignments', { body: d }), 'Assigned! 🎉');
    location.hash = `#/assignments/${r.id}`;
  };
}

async function assignmentDetail(main, { id }) {
  const a = await api(`/teacher/assignments/${id}`);
  main.innerHTML = `<a class="back" href="#/assignments">← Assignments</a>
    <div class="page-head"><h1>📝 ${esc(a.title)}</h1><div class="row"><button class="btn yellow" id="pr">🖨️ Print worksheet</button><button class="btn red" id="del">🗑️ Delete</button></div></div>
    <p class="muted">${esc(a.instructions)} ${a.due_date ? '· Due ' + esc(a.due_date) : ''}</p>
    <div class="card"><h2>Results</h2><table class="table"><thead><tr><th></th><th>Student</th><th>Score</th><th>Feedback</th><th></th></tr></thead><tbody>
    ${a.submissions.map((s) => `<tr><td>${esc(s.avatar)}</td><td>${esc(s.name)}</td>
      <td>${s.id ? `<b>${s.score}/${s.max_score}</b>` : '<span class="muted">Not yet</span>'}</td><td>${esc(s.feedback || '')}</td>
      <td class="right">${s.id ? `<button class="btn small blue mk" data-id="${s.id}">✍️ Check</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No students in this class.</td></tr>'}
    </tbody></table></div>
    <div class="card"><h2>Questions</h2><ol class="q-list">${a.questions.map((q) => `<li>${esc(q.q)} ${q.options.length ? `<div class="muted small">${q.options.map(esc).join(' · ')}</div>` : ''}
      ${q.answer ? `<div class="small">✅ ${esc(q.answer)}</div>` : ''}</li>`).join('')}</ol></div>`;
  $('#del').onclick = async () => { if (await confirmBox('Delete this assignment and all results?')) { await api(`/teacher/assignments/${id}`, { method: 'DELETE' }); location.hash = '#/assignments'; } };
  $('#pr').onclick = () => printHTML(a.title, `<h1>${esc(a.title)}</h1><p>Name: ____________________</p><p>${esc(a.instructions)}</p><ol>${a.questions.map((q) => `<li style="margin-bottom:18px">${esc(q.q)}
    ${q.options.length ? '<br>' + q.options.map((o) => `☐ ${esc(o)}`).join(' &nbsp; ') : '<br>______________________'}</li>`).join('')}</ol>`);
  $$('.mk', main).forEach((b) => {
    b.onclick = () => {
      const s = a.submissions.find((x) => x.id == b.dataset.id);
      const m = modal(`✍️ ${esc(s.name)}`, `<ol class="q-list">${a.questions.map((q, i) => {
        const ans = s.answers?.[i] ?? ''; const ok = q.answer && ans.trim().toLowerCase() === q.answer.trim().toLowerCase();
        return `<li>${esc(q.q)}<div class="${ok ? 'good' : q.answer ? 'bad' : ''}">${ok ? '✅' : q.answer ? '❌' : '✍️'} ${esc(ans || '—')}${!ok && q.answer ? ` <span class="muted">(answer: ${esc(q.answer)})</span>` : ''}</div></li>`;
      }).join('')}</ol>
        <form class="form"><div class="row"><label>Score (0–${s.max_score})<input type="number" name="score" min="0" max="${s.max_score}" value="${s.score}"></label></div>
        <label>Feedback<input name="feedback" value="${esc(s.feedback)}" placeholder="Great job! 🌟"></label>
        <div class="row end"><button class="btn green">💾 Save</button></div></form>`, { wide: true });
      $('form', m.el).onsubmit = async (e) => { e.preventDefault(); await act(e.submitter, () => api(`/teacher/submissions/${s.id}`, { method: 'PUT', body: formData(e.target) }), 'Saved ✅'); m.close(); assignmentDetail(main, { id }); };
    };
  });
}

// ---------- Students & evaluation ----------
const SKILLS = ['Listening', 'Speaking', 'Reading', 'Writing', 'Numbers', 'Creativity', 'Behaviour', 'Participation'];
async function studentsPage(main, _p, q) {
  const classes = await api('/teacher/classes');
  const cls = classes.find((c) => String(c.id) === q.class) || classes[0];
  if (!cls) { main.innerHTML = '<div class="empty">No classes yet.</div>'; return; }
  main.innerHTML = `<div class="page-head"><h1>📊 Evaluate students</h1>
    <select id="cs">${classes.map((c) => opt(c.id, c.name, cls.id)).join('')}</select></div>
    <div class="grid kids-grid">${cls.students.map((s) => `<div class="card kid-card"><div class="kid-avatar">${esc(s.avatar)}</div><h3>${esc(s.name)}</h3>
      <p>⭐ <b class="st-${s.id}">${s.stars}</b></p><div class="row center">
      <button class="btn small yellow star" data-id="${s.id}">+⭐</button><button class="btn small blue rep" data-id="${s.id}">📋 Report</button></div></div>`).join('') || '<div class="empty">No students in this class.</div>'}</div>`;
  $('#cs').onchange = (e) => { location.hash = `#/students?class=${e.target.value}`; };
  $$('.star', main).forEach((b) => {
    b.onclick = async () => { await api(`/teacher/students/${b.dataset.id}/stars`, { body: { delta: 1 } }); const el = $(`.st-${b.dataset.id}`); el.textContent = Number(el.textContent) + 1; toast('⭐ Star given!'); };
  });
  $$('.rep', main).forEach((b) => { b.onclick = () => reportModal(b.dataset.id, cls); });
}

async function reportModal(studentId, cls) {
  const r = await api(`/teacher/students/${studentId}/report`);
  const m = modal(`${esc(r.student.avatar)} ${esc(r.student.name)} — report`, `
    <form class="form card soft"><h3>➕ Add evaluation</h3>
      <div class="row"><label>Skill<select name="skill">${SKILLS.map((s) => opt(s, s)).join('')}</select></label>
      <label>Book<select name="book_id"><option value="">—</option>${cls.books.map((b) => opt(b.id, b.title)).join('')}</select></label>
      <label>Term<input name="term" placeholder="Term 1"></label></div>
      <label>Rating</label><div class="rating">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="rating" value="${n}" ${n === 4 ? 'checked' : ''}><span>${'⭐'.repeat(n)}</span></label>`).join('')}</div>
      <label>Remarks<input name="remarks" placeholder="Knows all letters A–J"></label>
      <div class="row end"><button class="btn green">💾 Add</button></div></form>
    <h3>Evaluations</h3><table class="table"><tbody>${r.evaluations.map((e) => `<tr><td>${esc(e.skill)}</td><td>${stars(e.rating)}</td><td>${esc(e.book_title || '')} ${esc(e.term)}</td><td>${esc(e.remarks)}</td>
      <td><button class="icon-btn de" data-id="${e.id}">🗑️</button></td></tr>`).join('') || '<tr><td class="muted">None yet</td></tr>'}</tbody></table>
    <h3>Assignments</h3><table class="table"><tbody>${r.submissions.map((s) => `<tr><td>${esc(s.title)}</td><td>${s.score}/${s.max_score}</td><td>${esc(s.feedback)}</td></tr>`).join('') || '<tr><td class="muted">None yet</td></tr>'}</tbody></table>
    <h3>Games</h3><p>${r.games.map((g) => `🎮 ${esc(g.game)}: ${g.plays} plays, best ${g.best}`).join('<br>') || '<span class="muted">No games played yet</span>'}</p>
    <div class="row end"><button class="btn yellow pr">🖨️ Print report card</button></div>`, { wide: true });
  $('form', m.el).onsubmit = async (e) => {
    e.preventDefault(); const d = formData(e.target); d.student_id = studentId;
    await act(e.submitter, () => api('/teacher/evaluations', { body: d }), 'Saved ✅'); m.close(); reportModal(studentId, cls);
  };
  $$('.de', m.el).forEach((b) => { b.onclick = async () => { await api(`/teacher/evaluations/${b.dataset.id}`, { method: 'DELETE' }); m.close(); reportModal(studentId, cls); }; });
  $('.pr', m.el).onclick = () => printHTML('Report card', `<h1>${esc(state.user.school.name)} — Report card</h1><p><b>${esc(r.student.name)}</b> · ${esc(cls.name)} · ⭐ ${r.student.stars}</p>
    <table><tr><th>Skill</th><th>Rating</th><th>Book / term</th><th>Remarks</th></tr>${r.evaluations.map((e) => `<tr><td>${esc(e.skill)}</td><td>${stars(e.rating)}</td><td>${esc(e.book_title || '')} ${esc(e.term)}</td><td>${esc(e.remarks)}</td></tr>`).join('')}</table>
    <h3>Assignments</h3><table>${r.submissions.map((s) => `<tr><td>${esc(s.title)}</td><td>${s.score}/${s.max_score}</td></tr>`).join('')}</table><p>Teacher: ${esc(state.user.name)}</p>`);
}

export default [
  { path: '/home', label: 'Home', icon: '🏠', render: home },
  { path: '/books', label: 'My Books', icon: '📚', render: booksPage },
  { path: '/plans', label: 'Lesson Plans', icon: '🗓️', render: plansPage },
  { path: '/plans/:id', render: planEditor },
  { path: '/assignments', label: 'Assignments', icon: '✅', render: assignmentsPage },
  { path: '/assignments/new', render: newAssignment },
  { path: '/assignments/:id', render: assignmentDetail },
  { path: '/students', label: 'Evaluate', icon: '📊', render: studentsPage },
];
