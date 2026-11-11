// Accessibility audit: logs in as every role, opens each page and runs axe-core (WCAG 2.1 A/AA).
//   node scripts/a11y-audit.mjs [baseUrl]      (needs the API + web app running with seed data)
// Exits 1 when serious/critical violations are found. Uses the pre-installed Playwright Chromium.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const axeSource = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.argv[2] || process.env.WEB_URL || 'http://localhost:3000';
const ROLES = [
  { name: 'anonymous', pages: ['/login'] },
  { name: 'publisher', login: { username: 'admin', password: 'Admin@12345' },
    pages: ['/admin', '/admin/books', '/admin/books/:id', '/admin/catalog', '/admin/calendar', '/admin/products', '/admin/products/:id', '/admin/schools', '/admin/schools/:id',
      '/admin/orders', '/admin/orders/:id', '/admin/licences', '/admin/games', '/admin/games/:id', '/admin/ai', '/admin/audit'] },
  { name: 'school admin', login: { schoolCode: 'SUN01', username: 'principal', password: 'School@12345' },
    pages: ['/school', '/school/licences', '/school/licences/:id', '/school/teachers', '/school/students', '/school/classes', '/school/classes/:id', '/school/classes/:id/gradebook', '/school/transfers', '/school/calendar'] },
  { name: 'teacher', login: { schoolCode: 'SUN01', username: 'teacher1', password: 'Teacher@12345' },
    pages: ['/teacher', '/teacher/books', '/read/:id', '/teacher/classes', '/teacher/classes/:id', '/teacher/plans', '/teacher/plans/:id', '/teacher/assessments', '/teacher/assessments/:id',
      '/teacher/questions', '/teacher/games', '/teacher/games/:id', '/teacher/ai', '/teacher/calendar'] },
  { name: 'student', login: { schoolCode: 'SUN01', username: 'student1', password: 'Student@123' },
    pages: ['/learn', '/learn/books', '/learn/games', '/learn/games/:id', '/homework/:id', '/learn/me'] },
];

/** For "/x/:id" pages, follow the first matching link found on the parent list page (or the home page). */
async function resolve(page, route, home) {
  if (!route.includes(':id')) return route;
  const [prefix, rest] = route.split(':id');
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[^/?#]+${rest.replace(/\//g, '\\/')}$`);
  for (const from of [prefix.replace(/\/$/, ''), home]) {
    if (!from) continue;
    await page.goto(BASE + from, { waitUntil: 'networkidle' });
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    const id = hrefs.find((h) => h && (re.test(h) || (rest && re.test(h.replace(rest, '') + rest))) && !h.endsWith('/new'));
    if (id) return rest && !id.endsWith(rest) ? id + rest : id;
    const base = hrefs.find((h) => h && new RegExp(`^${prefix}[^/?#]+$`).test(h));
    if (base) return base + rest;
  }
  return null;
}

const browser = await chromium.launch();
let serious = 0; const summary = [];
for (const role of ROLES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  if (role.login) {
    const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: role.login });
    if (!r.ok()) throw new Error(`login failed for ${role.name}: ${r.status()}`);
  }
  for (const route of role.pages) {
    const url = await resolve(page, route, role.pages[0]);
    if (!url) { summary.push(`  ? ${role.name} ${route}: no example found, skipped`); continue; }
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.addScriptTag({ content: axeSource });
    const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
    const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    serious += bad.length;
    summary.push(`${bad.length ? '  ✗' : '  ✓'} ${role.name.padEnd(12)} ${url}  (${res.passes.length} checks passed, ${res.violations.length} issues)`);
    for (const v of res.violations) {
      summary.push(`      [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} element(s)`);
      for (const n of v.nodes.slice(0, 3)) summary.push(`         ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(summary.join('\n'));
console.log(serious ? `\n${serious} serious/critical accessibility issue(s).` : '\nNo serious or critical accessibility issues.');
process.exit(serious ? 1 : 0);
