// Student area: big, colourful, simple.
import { api, esc, $, $$, state, confetti, toast, setStars, stars, act } from './core.js';
import { booksPage, loadBooks } from './books.js';
import { gamesPage, playGame, speak } from './games.js';

async function home(main) {
  const [asg, books, board] = await Promise.all([api('/student/assignments'), loadBooks(), api('/student/leaderboard')]);
  const pending = asg.filter((a) => !a.submitted_at).length;
  main.innerHTML = `<div class="kid-hello"><span class="kid-avatar big">${esc(state.user.avatar)}</span>
      <div><h1>Hi ${esc(state.user.name)}! 👋</h1><p>You have <b>⭐ ${state.user.stars}</b> stars. Let's learn and play!</p></div></div>
    <div class="grid big-tiles">
      <a class="tile red" href="#/books"><span class="ti">📚</span><b>My Books</b><span>${books.length} books</span></a>
      <a class="tile orange" href="#/homework"><span class="ti">📝</span><b>Homework</b><span>${pending ? `${pending} to do!` : 'All done 🎉'}</span></a>
      <a class="tile purple" href="#/games"><span class="ti">🎮</span><b>Games</b><span>Play &amp; win stars</span></a>
      <a class="tile green" href="#/stars"><span class="ti">⭐</span><b>My Stars</b><span>See my progress</span></a></div>
    ${board.length ? `<div class="card"><h2>🏆 Class star champions</h2><div class="podium">${board.slice(0, 5).map((s, i) =>
    `<div class="champ"><span class="medal">${['🥇', '🥈', '🥉', '🏅', '🏅'][i]}</span><span class="kid-avatar">${esc(s.avatar)}</span><b>${esc(s.name)}</b><small>⭐ ${s.stars}</small></div>`).join('')}</div></div>` : ''}`;
}

async function homeworkPage(main) {
  const list = await api('/student/assignments');
  main.innerHTML = `<div class="page-head"><h1>📝 My Homework</h1></div>
    ${list.length ? `<div class="grid cards">${list.map((a) => `<a class="card link hw ${a.submitted_at ? 'done' : ''}" href="#/homework/${a.id}" style="--c:${esc(a.color || '#ff922b')}">
      <div class="hw-emoji">${a.submitted_at ? '✅' : esc(a.emoji || '📝')}</div><h3>${esc(a.title)}</h3>
      <p class="muted">${esc(a.book_title || '')} · ${a.question_count} questions</p>
      ${a.submitted_at ? `<p class="big">⭐ ${a.score}/${a.max_score}</p>${a.feedback ? `<p class="note">💬 ${esc(a.feedback)}</p>` : ''}` : `<span class="btn orange">Start ▶️</span>${a.due_date ? `<p class="small">Due ${esc(a.due_date)}</p>` : ''}`}</a>`).join('')}</div>`
    : '<div class="empty">🎉 No homework yet. Go play a game!</div>'}`;
}

async function takeHomework(main, { id }) {
  const a = await api(`/student/assignments/${id}`);
  if (a.submission) {
    main.innerHTML = `<a class="back" href="#/homework">← Homework</a><div class="page-head"><h1>${esc(a.title)}</h1><span class="tag green">⭐ ${a.submission.score}/${a.submission.max_score}</span></div>
      ${a.submission.feedback ? `<div class="note big">💬 ${esc(a.submission.feedback)}</div>` : ''}
      <ol class="q-list big">${a.questions.map((q, i) => { const mine = a.submission.answers[i] || '—'; const ok = q.answer && mine.trim().toLowerCase() === q.answer.trim().toLowerCase();
      return `<li>${esc(q.q)}<div class="${ok ? 'good' : q.answer ? 'bad' : ''}">${ok ? '✅' : q.answer ? '❌' : '✍️'} ${esc(mine)} ${!ok && q.answer ? `→ ${esc(q.answer)}` : ''}</div></li>`; }).join('')}</ol>`;
    return;
  }
  const answers = Array(a.questions.length).fill('');
  let i = 0;
  const draw = () => {
    const q = a.questions[i];
    main.innerHTML = `<a class="back" href="#/homework">← Homework</a>
      <div class="quiz"><div class="quiz-top"><h2>${esc(a.title)}</h2><div class="dots">${a.questions.map((_, k) => `<span class="${k === i ? 'on' : answers[k] ? 'done' : ''}"></span>`).join('')}</div></div>
      ${i === 0 && a.instructions ? `<p class="hint">${esc(a.instructions)}</p>` : ''}
      <div class="quiz-q">${esc(q.q)} <button class="btn small ghost say">🔊</button></div>
      <div class="quiz-a">${q.type === 'short' ? `<input class="short" value="${esc(answers[i])}" placeholder="Type your answer ✏️">`
    : q.options.map((o, k) => `<button class="choice c${k % 4} ${answers[i] === o ? 'picked' : ''}" data-o="${esc(o)}">${q.type === 'tf' ? (o === 'True' ? '👍 ' : '👎 ') : ''}${esc(o)}</button>`).join('')}</div>
      <div class="row between"><button class="btn ghost big prev" ${i === 0 ? 'disabled' : ''}>⬅️ Back</button>
        ${i < a.questions.length - 1 ? '<button class="btn blue big next">Next ➡️</button>' : '<button class="btn green big submit">🚀 Finish!</button>'}</div></div>`;
    $('.say', main).onclick = () => speak(q.q);
    $$('.choice', main).forEach((b) => { b.onclick = () => { answers[i] = b.dataset.o; $$('.choice', main).forEach((x) => x.classList.toggle('picked', x === b)); }; });
    const sh = $('.short', main); if (sh) { sh.oninput = () => { answers[i] = sh.value; }; sh.focus(); }
    $('.prev', main).onclick = () => { i--; draw(); };
    const nx = $('.next', main); if (nx) nx.onclick = () => { i++; draw(); };
    const sb = $('.submit', main);
    if (sb) sb.onclick = async () => {
      const blank = answers.filter((x) => !String(x).trim()).length;
      if (blank && !confirm(`You skipped ${blank} question(s). Finish anyway?`)) return;
      const r = await act(sb, () => api(`/student/assignments/${id}/submit`, { body: { answers } }));
      setStars(state.user.stars + r.score);
      if (r.score) { confetti(100); speak('Great job!'); }
      main.innerHTML = `<div class="win"><div class="win-emoji">${r.score === r.max ? '🏆' : r.score ? '🌟' : '💪'}</div>
        <h2>${r.score === r.max ? 'Perfect!' : r.score ? 'Well done!' : 'Good try!'}</h2><p class="big">You got <b>${r.score}</b> of ${r.max} right</p>
        <p class="big">${'⭐'.repeat(Math.min(r.score, 10))}</p><div class="row center"><a class="btn blue big" href="#/homework/${id}">👀 See answers</a><a class="btn green big" href="#/games">🎮 Play a game</a></div></div>`;
    };
  };
  draw();
}

async function starsPage(main) {
  const [r, board] = await Promise.all([api('/student/report'), api('/student/leaderboard')]);
  main.innerHTML = `<div class="page-head"><h1>⭐ My Stars</h1></div>
    <div class="star-big">⭐ ${r.student.stars}</div>
    <div class="grid two">
      <div class="card"><h2>🌈 What my teacher says</h2>${r.evaluations.map((e) => `<div class="eval"><b>${esc(e.skill)}</b> <span>${stars(e.rating)}</span>${e.remarks ? `<p class="small">${esc(e.remarks)}</p>` : ''}</div>`).join('') || '<p class="muted">Nothing yet.</p>'}</div>
      <div class="card"><h2>🏆 Class champions</h2>${board.map((s, i) => `<div class="eval"><span>${i + 1}. ${esc(s.avatar)} ${esc(s.name)}</span><b>⭐ ${s.stars}</b></div>`).join('')}</div>
      <div class="card"><h2>🎮 My games</h2>${r.games.map((g) => `<div class="eval"><span>${esc(g.game)}</span><span>${g.plays}× · best ${g.best}</span></div>`).join('') || '<p class="muted">Play a game!</p>'}</div>
      <div class="card"><h2>📝 My homework</h2>${r.submissions.map((s) => `<div class="eval"><span>${esc(s.title)}</span><b>${s.score}/${s.max_score}</b></div>`).join('') || '<p class="muted">No homework done yet.</p>'}</div>
    </div>`;
}

export default [
  { path: '/home', label: 'Home', icon: '🏠', render: home },
  { path: '/books', label: 'My Books', icon: '📚', render: booksPage },
  { path: '/homework', label: 'Homework', icon: '📝', render: homeworkPage },
  { path: '/homework/:id', render: takeHomework },
  { path: '/games', label: 'Games', icon: '🎮', render: gamesPage },
  { path: '/games/:id', render: playGame },
  { path: '/stars', label: 'My Stars', icon: '⭐', render: starsPage },
];
export { toast };
