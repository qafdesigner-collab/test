// Kids games, powered by each book's vocabulary words.
import { api, esc, $, $$, confetti, toast, setStars, state } from './core.js';
import { loadBooks } from './books.js';

const EMOJI = {
  apple: '🍎', ball: '⚽', cat: '🐱', dog: '🐶', egg: '🥚', fish: '🐟', goat: '🐐', hat: '🎩', ice: '🧊', jug: '🏺', kite: '🪁',
  lion: '🦁', moon: '🌙', nest: '🪺', orange: '🍊', pen: '🖊️', queen: '👸', rat: '🐀', sun: '☀️', tree: '🌳', umbrella: '☂️',
  van: '🚐', watch: '⌚', box: '📦', yak: '🐃', zebra: '🦓', banana: '🍌', car: '🚗', bus: '🚌', duck: '🦆', elephant: '🐘',
  frog: '🐸', grapes: '🍇', horse: '🐴', house: '🏠', jam: '🍯', key: '🔑', leaf: '🍃', mango: '🥭', monkey: '🐵', owl: '🦉',
  pig: '🐷', rabbit: '🐰', star: '⭐', tiger: '🐯', train: '🚆', water: '💧', book: '📘', bird: '🐦', cake: '🎂', cow: '🐮',
  flower: '🌸', milk: '🥛', bag: '🎒', bed: '🛏️', cup: '☕', door: '🚪', hen: '🐔', ink: '🖋️', ant: '🐜', bee: '🐝',
  one: '1️⃣', two: '2️⃣', three: '3️⃣', four: '4️⃣', five: '5️⃣', six: '6️⃣', seven: '7️⃣', eight: '8️⃣', nine: '9️⃣', ten: '🔟',
  circle: '⚪', square: '🟥', triangle: '🔺', heart: '❤️', big: '🐘', small: '🐭', red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡',
};
const DEFAULT_WORDS = ['apple', 'ball', 'cat', 'dog', 'egg', 'fish', 'hat', 'lion', 'sun', 'tree', 'moon', 'kite'];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pickN = (a, n) => shuffle(a).slice(0, n);
export const emojiFor = (w) => EMOJI[w.toLowerCase()] || null;

export function speak(text) {
  try {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.rate = 0.85; u.pitch = 1.2; u.lang = 'en-US';
    speechSynthesis.speak(u);
  } catch { /* speech not available */ }
}

async function wordsFor(bookId) {
  const books = await loadBooks();
  const chosen = bookId ? books.filter((b) => b.id == bookId) : books;
  const words = [...new Set(chosen.flatMap((b) => (b.vocabulary || '').split(',')).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]{2,10}$/.test(w)))];
  return words.length >= 4 ? words : DEFAULT_WORDS;
}

const GAMES = [
  { id: 'memory', name: 'Memory Match', icon: '🃏', color: 'red', desc: 'Find the picture and word pairs!' },
  { id: 'builder', name: 'Word Builder', icon: '🔤', color: 'blue', desc: 'Put the letters in the right order!' },
  { id: 'balloons', name: 'Letter Pop', icon: '🎈', color: 'purple', desc: 'Pop the balloon with the right letter!' },
  { id: 'count', name: 'Count & Tap', icon: '🍎', color: 'green', desc: 'Count the things and tap the number!' },
];

export async function gamesPage(main, _p, q) {
  const books = await loadBooks();
  main.innerHTML = `<div class="page-head"><h1>🎮 Games</h1>
    ${books.length > 1 ? `<select id="bk"><option value="">All my books</option>${books.map((b) => `<option value="${b.id}" ${b.id == q.book ? 'selected' : ''}>${esc(b.emoji)} ${esc(b.title)}</option>`).join('')}</select>` : ''}</div>
    <div class="grid games">${GAMES.map((g) => `<a class="game-tile ${g.color}" data-g="${g.id}" href="#/games/${g.id}${q.book ? '?book=' + q.book : ''}">
      <span class="gi">${g.icon}</span><b>${g.name}</b><small>${g.desc}</small></a>`).join('')}</div>`;
  const bk = $('#bk');
  if (bk) bk.onchange = () => { location.hash = `#/games${bk.value ? '?book=' + bk.value : ''}`; };
}

async function finish(main, game, score, max, again) {
  confetti(120); speak('Well done!');
  let earned = 0;
  try { const r = await api('/student/games', { body: { game: game.name, score } }); earned = r.stars; setStars(r.total); } catch (e) { toast(e.message, 'err'); }
  main.querySelector('.game-area').innerHTML = `<div class="win"><div class="win-emoji">🏆</div><h2>Hooray! You did it!</h2>
    <p class="big">Score: <b>${score}</b> / ${max}</p><p class="big">${earned ? `You earned ${'⭐'.repeat(earned)}` : 'Great practice! 🌈'}</p>
    <div class="row center"><button class="btn green big again">🔁 Play again</button><a class="btn blue big" href="#/games">🎮 More games</a></div></div>`;
  $('.again', main).onclick = again;
}

export async function playGame(main, { id }, q) {
  const game = GAMES.find((g) => g.id === id);
  if (!game) throw new Error('Game not found');
  const words = await wordsFor(q.book);
  main.innerHTML = `<a class="back" href="#/games${q.book ? '?book=' + q.book : ''}">← Games</a>
    <div class="game-head ${game.color}"><span class="gi">${game.icon}</span><h1>${game.name}</h1><span class="score-pill">Score <b id="sc">0</b></span></div>
    <div class="game-area"></div>`;
  const area = $('.game-area', main);
  const again = () => playGame(main, { id }, q);
  const setScore = (n) => { $('#sc').textContent = n; };
  ({ memory, builder, balloons, count })[id](area, words, setScore, (s, m) => finish(main, game, s, m, again));
}

// 🃏 Memory Match: pair each picture with its word.
function memory(area, words, setScore, done) {
  const pool = words.filter(emojiFor);
  const chosen = pickN(pool.length >= 4 ? pool : DEFAULT_WORDS, 6);
  const cards = shuffle(chosen.flatMap((w) => [{ w, face: emojiFor(w), pic: true }, { w, face: w }]));
  area.innerHTML = `<p class="hint">Tap two cards. Find the picture and its word! 🧠</p><div class="memory">${cards.map((c, i) =>
    `<button class="mcard" data-i="${i}"><span class="back">❓</span><span class="front ${c.pic ? 'pic' : 'word'}">${esc(c.face)}</span></button>`).join('')}</div>`;
  let open = []; let found = 0; let tries = 0; let lock = false;
  $$('.mcard', area).forEach((el) => {
    el.onclick = () => {
      if (lock || el.classList.contains('flip')) return;
      el.classList.add('flip'); const c = cards[el.dataset.i];
      if (!c.pic) speak(c.w);
      open.push(el);
      if (open.length < 2) return;
      tries++;
      const [a, b] = open.map((x) => cards[x.dataset.i]);
      if (a.w === b.w && a.pic !== b.pic) {
        open.forEach((x) => x.classList.add('done')); open = []; found++; speak(a.w);
        setScore(found);
        if (found === chosen.length) setTimeout(() => done(Math.max(1, 12 - Math.max(0, tries - chosen.length)), 12), 600);
      } else { lock = true; setTimeout(() => { open.forEach((x) => x.classList.remove('flip')); open = []; lock = false; }, 900); }
    };
  });
}

// 🔤 Word Builder: tap scrambled letters in order.
function builder(area, words, setScore, done) {
  const list = pickN(words.filter((w) => w.length <= 7), 5);
  let round = 0; let score = 0;
  const next = () => {
    if (round >= list.length) return done(score, list.length);
    const w = list[round]; let pos = 0; let mistakes = 0;
    let letters = shuffle(w.split(''));
    if (letters.join('') === w && w.length > 1) letters = [...letters.slice(1), letters[0]];
    area.innerHTML = `<p class="hint">Word ${round + 1} of ${list.length} · <button class="btn small ghost say">🔊 Hear it</button></p>
      <div class="build-pic">${emojiFor(w) || '🔤'}</div>
      <div class="slots">${w.split('').map(() => '<span class="slot"></span>').join('')}</div>
      <div class="letters">${letters.map((l, i) => `<button class="letter" data-i="${i}">${esc(l.toUpperCase())}</button>`).join('')}</div>`;
    speak(w);
    $('.say', area).onclick = () => speak(w);
    $$('.letter', area).forEach((b) => {
      b.onclick = () => {
        if (letters[b.dataset.i] === w[pos]) {
          $$('.slot', area)[pos].textContent = w[pos].toUpperCase(); $$('.slot', area)[pos].classList.add('ok');
          b.disabled = true; b.classList.add('used'); pos++;
          if (pos === w.length) { if (!mistakes) score++; setScore(score); speak(w); round++; setTimeout(next, 900); }
        } else { mistakes++; b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 400); }
      };
    });
  };
  next();
}

// 🎈 Letter Pop: pop the balloon showing the target letter.
function balloons(area, words, setScore, done) {
  const letters = [...new Set(words.map((w) => w[0].toUpperCase()))];
  const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const rounds = 8; let round = 0; let score = 0;
  const colors = ['#ff6b6b', '#ffd43b', '#51cf66', '#4dabf7', '#cc5de8', '#ff922b'];
  const next = () => {
    if (round >= rounds) return done(score, rounds);
    const target = letters[Math.floor(Math.random() * letters.length)];
    const word = words.find((w) => w[0].toUpperCase() === target);
    const opts = shuffle([target, ...pickN(all.filter((l) => l !== target), 4)]);
    area.innerHTML = `<p class="hint">Pop the letter <b class="target">${target}</b> — like ${emojiFor(word) || ''} <b>${esc(word)}</b>! <button class="btn small ghost say">🔊</button></p>
      <div class="sky">${opts.map((l, i) => `<button class="balloon" style="--c:${colors[i % colors.length]};--d:${i}">${l}</button>`).join('')}</div>`;
    const say = () => speak(`Pop the letter ${target}. ${target} for ${word}`);
    say(); $('.say', area).onclick = say;
    let missed = false;
    $$('.balloon', area).forEach((b) => {
      b.onclick = () => {
        if (b.textContent === target) {
          b.classList.add('popped'); if (!missed) { score++; setScore(score); }
          round++; setTimeout(next, 700);
        } else { missed = true; b.classList.add('shake'); speak('Try again'); setTimeout(() => b.classList.remove('shake'), 400); }
      };
    });
  };
  next();
}

// 🍎 Count & Tap: count the objects.
function count(area, _words, setScore, done) {
  const things = ['🍎', '⭐', '🐟', '🎈', '🌸', '🐥', '🚗', '🍌', '🐞', '⚽'];
  const rounds = 8; let round = 0; let score = 0;
  const next = () => {
    if (round >= rounds) return done(score, rounds);
    const n = 1 + Math.floor(Math.random() * 10); const t = things[Math.floor(Math.random() * things.length)];
    const opts = shuffle([n, ...pickN([...Array(10)].map((_, i) => i + 1).filter((x) => x !== n), 2)]);
    area.innerHTML = `<p class="hint">How many ${t} can you see?</p><div class="count-box">${Array(n).fill(`<span>${t}</span>`).join('')}</div>
      <div class="row center">${opts.map((o) => `<button class="num-btn" data-n="${o}">${o}</button>`).join('')}</div>`;
    speak('How many can you see?');
    let missed = false;
    $$('.num-btn', area).forEach((b) => {
      b.onclick = () => {
        if (Number(b.dataset.n) === n) {
          b.classList.add('right'); speak(String(n)); if (!missed) { score++; setScore(score); }
          round++; setTimeout(next, 800);
        } else { missed = true; b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 400); }
      };
    });
  };
  next();
}

export { state };
