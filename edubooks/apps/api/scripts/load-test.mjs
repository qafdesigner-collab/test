// Load test: simulates a busy school period (students opening home, books, games, homework;
// teachers checking homework) against a running API with seed data.
//   node scripts/load-test.mjs [apiBase] [seconds] [connections]
// Start the API with RATE_LIMIT_PER_MIN set high for the test, e.g. RATE_LIMIT_PER_MIN=1000000.
import autocannon from 'autocannon';

const BASE = process.argv[2] || 'http://localhost:4000';
const DURATION = Number(process.argv[3] || 30);
const CONNECTIONS = Number(process.argv[4] || 50);

async function login(body) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`login ${body.username}: ${r.status}`);
  return r.headers.get('set-cookie').split(';')[0];
}
const get = async (cookie, p) => (await fetch(BASE + p, { headers: { cookie } })).json();

const students = [];
for (const [code, names] of [['SUN01', ['student1', 'student2', 'student3']], ['GVS02', ['student1', 'student2', 'student3']]])
  for (const username of names) students.push(await login({ schoolCode: code, username, password: 'Student@123' }));
const teachers = [await login({ schoolCode: 'SUN01', username: 'teacher1', password: 'Teacher@12345' }), await login({ schoolCode: 'GVS02', username: 'teacher1', password: 'Teacher@12345' })];
const lib = await get(students[0], '/api/library');
const edition = (Array.isArray(lib) ? lib : lib.items)[0].editionId;

// Weighted mix of what a class actually does.
const mix = [
  ...Array(3).fill({ who: students, path: '/api/student/home' }),
  ...Array(2).fill({ who: students, path: '/api/student/games' }),
  { who: students, path: '/api/library' },
  { who: [students[0]], path: `/api/reader/editions/${edition}` },
  { who: students, path: '/api/student/homework' },
  { who: students, path: '/api/student/achievements' },
  { who: teachers, path: '/api/teacher/assessments' },
  { who: teachers, path: '/api/classes?mine=true' },
  { who: students, path: '/api/auth/me' },
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const failures = new Map();

console.log(`Load test: ${CONNECTIONS} connections for ${DURATION}s against ${BASE} (${students.length} students, ${teachers.length} teachers)`);
const result = await autocannon({
  url: BASE, connections: CONNECTIONS, duration: DURATION,
  requests: [{
    setupRequest: (req, ctx) => { const m = pick(mix); ctx.path = m.path; return { ...req, method: 'GET', path: m.path, headers: { cookie: pick(m.who) } }; },
    onResponse: (status, body, ctx) => { if (status >= 300) { const k = `${status} ${ctx.path} ${String(body).slice(0, 120)}`; failures.set(k, (failures.get(k) || 0) + 1); } },
  }],
});
for (const [k, n] of failures) console.log(`  ${n} × ${k}`);
const l = result.latency;
const non2xx = result.non2xx + result.errors + result.timeouts;
console.log(`requests: ${result.requests.total}  (${Math.round(result.requests.average)}/s)   errors/non-2xx: ${non2xx}`);
console.log(`latency ms: p50 ${l.p50}  p90 ${l.p90}  p97.5 ${l.p97_5}  p99 ${l.p99}  max ${l.max}`);
const ok = non2xx === 0 && l.p97_5 < Number(process.env.P97_TARGET_MS || 500);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
