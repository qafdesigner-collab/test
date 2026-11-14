// AI helper. Uses a free-tier provider if a key is configured, otherwise a
// built-in offline generator so the feature always works.
//   GEMINI_API_KEY  -> Google Gemini (free tier)   [GEMINI_MODEL, default gemini-2.5-flash]
//   GROQ_API_KEY    -> Groq (free tier, Llama)      [GROQ_MODEL, default llama-3.3-70b-versatile]
//   OLLAMA_URL      -> local Ollama, fully free     [OLLAMA_MODEL, default llama3.2]

function provider() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.OLLAMA_URL) return 'ollama';
  return 'offline';
}

async function callLLM(prompt) {
  const p = provider();
  const signal = AbortSignal.timeout(60000);
  if (p === 'gemini') {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!r.ok) throw new Error(`Gemini error ${r.status}`);
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || '';
  }
  const isGroq = p === 'groq';
  const url = isGroq ? 'https://api.groq.com/openai/v1/chat/completions'
    : `${process.env.OLLAMA_URL.replace(/\/$/, '')}/v1/chat/completions`;
  const r = await fetch(url, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(isGroq ? { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } : {}) },
    body: JSON.stringify({
      model: isGroq ? (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile') : (process.env.OLLAMA_MODEL || 'llama3.2'),
      messages: [{ role: 'user', content: prompt }], temperature: 0.7,
    }),
  });
  if (!r.ok) throw new Error(`AI provider error ${r.status}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

function extractJSON(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('AI did not return a question list');
  return JSON.parse(m[0]);
}

function normalizeQuestions(list) {
  return (Array.isArray(list) ? list : []).map((q) => {
    const type = ['mcq', 'tf', 'short'].includes(q.type) ? q.type : (q.options ? 'mcq' : 'short');
    let options = type === 'tf' ? ['True', 'False'] : (Array.isArray(q.options) ? q.options.map(String).slice(0, 6) : []);
    let answer = String(q.answer ?? '');
    if (type === 'tf') answer = /^t/i.test(answer) ? 'True' : 'False';
    if (type === 'mcq' && !options.includes(answer) && options.length) answer = options[0];
    return { q: String(q.q || q.question || '').slice(0, 500), type, options, answer };
  }).filter((q) => q.q);
}

// ---------- Offline generator (no internet / no key needed) ----------
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
function vocab(ctx) {
  return (ctx.book?.vocabulary || '').split(',').map((s) => s.trim()).filter(Boolean);
}
function offlineQuestions(ctx, count) {
  const words = vocab(ctx);
  const out = [];
  const topic = ctx.topic || ctx.component?.topics || ctx.book?.title || 'today\'s lesson';
  for (let i = 0; i < count; i++) {
    const w = words.length ? words[i % words.length] : null;
    const kind = i % 3;
    if (w && kind === 0) {
      const opts = shuffle([w[0].toUpperCase(), ...shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((l) => l !== w[0].toUpperCase())).slice(0, 3)]);
      out.push({ q: `"${w}" starts with which letter?`, type: 'mcq', options: opts, answer: w[0].toUpperCase() });
    } else if (w && kind === 1) {
      const others = shuffle(words.filter((x) => x !== w)).slice(0, 3);
      out.push({ q: `Find and circle the word "${w}".`, type: 'mcq', options: shuffle([w, ...others]), answer: w });
    } else if (w) {
      out.push({ q: `"${w}" has ${w.length} letters.`, type: 'tf', options: ['True', 'False'], answer: 'True' });
    } else {
      out.push({ q: `Say one thing you learned about ${topic}.`, type: 'short', options: [], answer: '' });
    }
  }
  return out;
}
function offlineLessonPlan(ctx) {
  const words = vocab(ctx).slice(0, 6);
  const topic = ctx.topic || ctx.component?.topics || 'the lesson';
  const dur = ctx.duration || 40;
  return `LESSON PLAN — ${ctx.book?.title || ''} ${ctx.component ? '· ' + ctx.component.title : ''}
Topic: ${topic}
Class level: ${ctx.book?.level || 'Early years'}   Duration: ${dur} minutes

🎯 Learning objectives
• Children will recognise and say the key words: ${words.join(', ') || topic}.
• Children will take part in a song/rhyme and a hands-on activity.
• Children will complete one page of the book with support.

🧺 Materials
• Book page, flash cards, teacher card, coloured crayons, classroom dangler.

⏱ Lesson flow
1. Warm-up (5 min): Hello song + show the dangler, ask "What do you see?"
2. Introduce (10 min): Show flash cards one by one — ${words.slice(0, 3).join(', ') || topic}. Children repeat with actions.
3. Activity (10 min): "Find it!" — hide cards around the room; children find and name them.
4. Book work (10 min): Complete the book page; teacher moves around and praises effort.
5. Wrap-up (5 min): Quick recap game, give a star ⭐ to every child who answered.

🏠 Homework
• Homework Book page on ${topic}. Parents say the words with the child.

✅ Assessment
• Observe: can the child name at least 3 words? Note in Evaluation (Speaking / Recognition).
${ctx.extra ? '\n📝 Teacher notes: ' + ctx.extra : ''}`;
}

function context(ctx) {
  return `Book: ${ctx.book?.title || ''} (${ctx.book?.subject || ''}, level ${ctx.book?.level || ''}).
${ctx.component ? `Section: ${ctx.component.title} — ${ctx.component.topics || ''}.` : ''}
Topic: ${ctx.topic || ''}. Key vocabulary: ${ctx.book?.vocabulary || 'n/a'}.
${ctx.extra ? 'Teacher notes: ' + ctx.extra : ''}`;
}

async function lessonPlan(ctx) {
  if (provider() === 'offline') return { text: offlineLessonPlan(ctx), provider: 'offline' };
  const prompt = `You are an expert early-years teacher. Write a practical, cheerful lesson plan for young children.
${context(ctx)}
Duration: ${ctx.duration || 40} minutes.
Include: objectives, materials, step-by-step timed activities (songs, games, movement), book work, homework, and simple assessment.
Plain text with emoji headings. No markdown tables.`;
  return { text: (await callLLM(prompt)).trim(), provider: provider() };
}

async function questions(ctx) {
  const count = Math.min(Math.max(parseInt(ctx.count, 10) || 5, 1), 20);
  if (provider() === 'offline') return { questions: offlineQuestions(ctx, count), provider: 'offline' };
  const prompt = `Create ${count} simple questions for young children (kindergarten/primary) for an assignment.
${context(ctx)}
Mix types: "mcq" (3-4 short options), "tf" (True/False) and a few "short" answer.
Return ONLY a JSON array, each item: {"q": "...", "type": "mcq|tf|short", "options": ["..."], "answer": "..."}.`;
  return { questions: normalizeQuestions(extractJSON(await callLLM(prompt))), provider: provider() };
}

module.exports = { provider, lessonPlan, questions, normalizeQuestions };
