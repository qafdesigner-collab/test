/*
 * Knowledge Gate — single-process entry for cPanel "Setup Node.js App" (Phusion Passenger).
 * Serves the API (/api/*) and the website from one Node.js process.
 * On first start (no install.lock) it runs a browser-based installer instead.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = __dirname;
const API = path.join(ROOT, 'api');
const WEB = path.join(ROOT, 'web');
const ENV_FILE = path.join(ROOT, '.env');
const LOCK_FILE = path.join(ROOT, 'install.lock');
const KEY_FILE = path.join(ROOT, 'install-key.txt');
const MIN_NODE = 20;

// ---------- .env loading ----------
function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (/^".*"$/.test(v)) v = JSON.parse(v); else if (/^'.*'$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const vars = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
  for (const [k, v] of Object.entries(vars)) if (process.env[k] === undefined) process.env[k] = v;
}
const q = (v) => JSON.stringify(String(v));
const log = (level, msg) => console.log(JSON.stringify({ time: new Date().toISOString(), level, msg }));

// ---------- request handler (swapped from installer to the app after install) ----------
const startingPage = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><title>Starting…</title></head>'
  + '<body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:system-ui,sans-serif;background:linear-gradient(135deg,#fef3c7,#e0e7ff 45%,#fce7f3);color:#1e293b">'
  + '<div style="text-align:center"><div style="font-size:48px">📚</div><h1 style="margin:8px 0">Knowledge Gate is starting…</h1><p style="color:#475569">This page reloads by itself in a few seconds.</p></div></body></html>';
let handler = (req, res) => {
  if (req.url.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '3' }); return res.end('{"statusCode":503,"message":"Starting"}'); }
  res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '3', 'Cache-Control': 'no-store' }); res.end(startingPage);
};
const server = http.createServer((req, res) => handler(req, res));

async function bootApp() {
  loadEnv();
  process.env.NODE_ENV = 'production';
  process.env.EDUBOOKS_APP_ROOT = ROOT; // enables Super admin → Updates
  if (process.env.DB_MODE === 'embedded') {
    const edb = require('./embedded-db');
    const restored = await edb.restoreIfRequested(process.env.PG_SUPER_PASSWORD);
    if (restored) log('info', `Database restored from ${restored.restored}; the previous database was kept as ${restored.previous}`);
    await edb.ensureRunning(process.env.PG_SUPER_PASSWORD);
    edb.scheduleBackups(process.env.PG_SUPER_PASSWORD, log);
    edb.watchdog(process.env.PG_SUPER_PASSWORD, log);
    // New version uploaded? Take a safety backup before applying database changes.
    const build = fs.existsSync(path.join(ROOT, 'BUILD_ID')) ? fs.readFileSync(path.join(ROOT, 'BUILD_ID'), 'utf8').trim() : '';
    const lastFile = path.join(ROOT, '.last-build');
    const last = fs.existsSync(lastFile) ? fs.readFileSync(lastFile, 'utf8').trim() : '';
    if (build && last && build !== last) {
      try { const f = await edb.backup(process.env.PG_SUPER_PASSWORD, Number(process.env.BACKUP_KEEP || 7) + 1); if (f) log('info', `Safety backup before update: backups/${path.basename(f)}`); }
      catch (e) { log('error', `Safety backup before update failed: ${e.message}`); }
    }
    if (build) fs.writeFileSync(lastFile, build);
  }
  // Apply any database changes shipped with an update (no-op when up to date).
  await run(path.join(API, 'dist', 'db', 'migrate.js'), {});
  const express = require('express');
  const next = require('next');
  const { NestFactory } = require('@nestjs/core');
  const { ExpressAdapter } = require('@nestjs/platform-express');
  const { AppModule } = require(path.join(API, 'dist', 'app.module'));
  const { configureApp } = require(path.join(API, 'dist', 'main'));
  const { JsonLogger } = require(path.join(API, 'dist', 'common', 'json-logger'));

  const nextApp = next({ dev: false, dir: WEB });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  const ex = express();
  // Website: everything that is not /api goes to Next.js (registered before the API routes).
  ex.use((req, res, nxt) => (req.path === '/api' || req.path.startsWith('/api/') ? nxt() : handle(req, res)));
  const app = configureApp(await NestFactory.create(AppModule, new ExpressAdapter(ex), { bodyParser: false, logger: new JsonLogger() }));
  await app.init();
  handler = withStatus(ex);
  try { require('./updater').onBootSuccess(log); } catch (e) { log('error', `Update bookkeeping failed: ${e.message}`); }
  console.log(JSON.stringify({ level: 'info', msg: 'Knowledge Gate started', node: process.version }));
}

// ---------- installer ----------
function installKey() {
  if (!fs.existsSync(KEY_FILE)) fs.writeFileSync(KEY_FILE, crypto.randomBytes(9).toString('base64url') + '\n', { mode: 0o600 });
  return fs.readFileSync(KEY_FILE, 'utf8').trim();
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--brand:#4338ca;--ink:#1e293b;--muted:#475569;--bg:#f5f3ff}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:linear-gradient(135deg,#fef3c7,#e0e7ff 45%,#fce7f3);color:var(--ink);min-height:100vh}
main{max-width:760px;margin:0 auto;padding:32px 16px}
.card{background:#fff;border-radius:20px;box-shadow:0 10px 30px rgba(67,56,202,.12);padding:28px;margin-bottom:20px}
h1{margin:0 0 4px;font-size:28px}h2{font-size:18px;margin:24px 0 8px;color:var(--brand)}p{color:var(--muted);line-height:1.5}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 4px}small{color:var(--muted);font-weight:400}
input,select{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px}input:focus,select:focus{outline:3px solid #a5b4fc;border-color:var(--brand)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:560px){.row{grid-template-columns:1fr}}
button{margin-top:24px;background:var(--brand);color:#fff;border:0;border-radius:12px;padding:14px 22px;font-size:16px;font-weight:700;cursor:pointer}
.check{display:flex;gap:8px;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:3px}
ul.res{list-style:none;padding:0}ul.res li{padding:8px 12px;border-radius:10px;margin:6px 0;background:#f8fafc}
.ok{border-left:5px solid #15803d}.warn{border-left:5px solid #b45309}.err{border-left:5px solid #b91c1c}
code{background:#eef2ff;padding:2px 6px;border-radius:6px}.logo{font-size:40px}
</style></head><body><main>${body}</main></body></html>`;
}

function form(values = {}, errors = []) {
  const v = (k, d = '') => esc(values[k] ?? d);
  const host = values.siteUrl || '';
  return page('Install Knowledge Gate', `
<div class="card"><div class="logo">📚✨</div><h1>Install Knowledge Gate</h1>
<p>This one-time setup connects the app to its database and creates your publisher account. It takes about a minute.</p>
${errors.length ? `<ul class="res">${errors.map((e) => `<li class="err">${esc(e)}</li>`).join('')}</ul>` : ''}
</div>
<form method="post" action="/install" class="card">
<h2>1. Installer key</h2>
<label for="key">Installer key <small>— open <code>install-key.txt</code> in the app folder with cPanel File Manager</small></label>
<input id="key" name="key" required autocomplete="off" value="${v('key')}">

<h2>2. Website</h2>
<label for="siteUrl">Website address</label>
<input id="siteUrl" name="siteUrl" type="url" required placeholder="https://lms.yourdomain.com" value="${esc(host)}">

<h2>3. Database</h2>
<label class="check"><input type="radio" name="dbMode" value="embedded" ${values.dbMode !== 'external' ? 'checked' : ''}> <span><strong>Built-in database (recommended)</strong>. Use this if your hosting has only MySQL. Knowledge Gate runs its own private PostgreSQL inside the app folder. It needs no setup and is reachable only by this app.</span></label>
<label class="check"><input type="radio" name="dbMode" value="external" ${values.dbMode === 'external' ? 'checked' : ''}> <span><strong>My hosting's PostgreSQL</strong> (cPanel → PostgreSQL Databases), if you have it.</span></label>
<details ${values.dbMode === 'external' ? 'open' : ''}><summary style="cursor:pointer;margin-top:10px;font-weight:600">PostgreSQL details (only for the second option)</summary>
<p>Create one database and one extra user. Enter your <strong>main cPanel username</strong> as the owner user and the extra user as the app user.</p>
<div class="row"><div><label for="dbHost">Host</label><input id="dbHost" name="dbHost" value="${v('dbHost', 'localhost')}"></div>
<div><label for="dbPort">Port</label><input id="dbPort" name="dbPort" value="${v('dbPort', '5432')}"></div></div>
<label for="dbName">Database name</label><input id="dbName" name="dbName" placeholder="cpuser_edubooks" value="${v('dbName')}">
<div class="row"><div><label for="ownerUser">Owner user</label><input id="ownerUser" name="ownerUser" placeholder="cpuser" value="${v('ownerUser')}"></div>
<div><label for="ownerPass">Owner password</label><input id="ownerPass" name="ownerPass" type="password"></div></div>
<div class="row"><div><label for="appUser">App user</label><input id="appUser" name="appUser" placeholder="cpuser_app" value="${v('appUser')}"></div>
<div><label for="appPass">App password</label><input id="appPass" name="appPass" type="password"></div></div>
</details>

<h2>4. Your publisher account</h2>
<label for="publisher">Publisher name</label><input id="publisher" name="publisher" placeholder="Your Publishing House" value="${v('publisher')}">
<div class="row"><div><label for="adminUser">Admin username</label><input id="adminUser" name="adminUser" pattern="[a-z0-9._-]{3,40}" value="${v('adminUser', 'admin')}"></div>
<div><label for="adminPass">Admin password <small>(10+ characters)</small></label><input id="adminPass" name="adminPass" type="password" minlength="10"></div></div>
<label class="check"><input type="checkbox" name="demo" value="1" ${values.demo ? 'checked' : ''}> <span>Instead, load <strong>demo data</strong> for trying the system: sample books, 3 schools, and accounts with well-known passwords. <strong>Do not use this for real schools.</strong></span></label>

<h2>5. AI teaching assistant</h2>
<label for="ai">AI provider</label>
<select id="ai" name="ai"><option value="offline">Offline drafts (no AI service, free)</option><option value="anthropic" ${values.ai === 'anthropic' ? 'selected' : ''}>Claude (Anthropic API key)</option><option value="openai-compatible" ${values.ai === 'openai-compatible' ? 'selected' : ''}>Self-hosted model (OpenAI-compatible URL)</option></select>
<label for="aiUrl">Model server URL <small>(self-hosted only, e.g. http://your-gpu-server:11434/v1)</small></label><input id="aiUrl" name="aiUrl" value="${v('aiUrl')}">
<label for="aiKey">API key <small>(Claude or self-hosted, if needed)</small></label><input id="aiKey" name="aiKey" type="password" autocomplete="off">

<button type="submit">Check and install 🚀</button>
</form>`);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))));
    req.on('error', reject);
  });
}

function run(script, env, args = []) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [script, ...args], { cwd: path.dirname(script), env: { ...process.env, ...env }, timeout: 15 * 60_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => (err ? reject(new Error((stderr || stdout || err.message).trim().split('\n').slice(-40).join('\n'))) : resolve(stdout.trim())));
  });
}

const dbUrl = (user, pass, f) => `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${f.dbHost}:${Number(f.dbPort) || 5432}/${encodeURIComponent(f.dbName)}`;

/** Checks the server and database before anything is written. Returns [{level, text}]. */
async function preflight(f) {
  const out = []; const add = (level, text) => out.push({ level, text });
  const major = Number(process.versions.node.split('.')[0]);
  add(major >= MIN_NODE ? 'ok' : 'err', `Node.js ${process.version}${major >= MIN_NODE ? '' : ` — version ${MIN_NODE} or newer is needed (choose it in Setup Node.js App)`}`);
  try { require.resolve('next'); require.resolve('@nestjs/core'); add('ok', 'Packages installed'); } catch { add('err', 'Packages are missing — click "Run NPM Install" in Setup Node.js App, then restart'); return out; }
  const storage = path.join(ROOT, 'storage');
  try { fs.mkdirSync(storage, { recursive: true }); fs.writeFileSync(path.join(storage, '.write-test'), 'ok'); fs.rmSync(path.join(storage, '.write-test')); add('ok', 'File storage folder is writable'); }
  catch (e) { add('err', `Cannot write to ${storage}: ${e.message}`); }
  if (f.dbMode !== 'external') { out.push(...(await require('./embedded-db').check())); return out; }
  if (!f.dbName || !f.ownerUser || !f.appUser) { add('err', 'Fill in the database name and both users, or choose the built-in database'); return out; }
  if (f.ownerUser === f.appUser) add('err', 'The owner user and the app user must be two different users');
  const { Client } = require('pg');
  const owner = new Client({ connectionString: dbUrl(f.ownerUser, f.ownerPass, f), connectionTimeoutMillis: 8000 });
  try {
    await owner.connect();
    const ver = Number((await owner.query('SHOW server_version_num')).rows[0].server_version_num);
    add(ver >= 130000 ? 'ok' : 'err', `PostgreSQL ${Math.floor(ver / 10000)}${ver >= 130000 ? '' : ' — version 13 or newer is needed. Ask your host to upgrade.'}`);
    for (const ext of ['pgcrypto', 'citext']) {
      try { await owner.query(`CREATE EXTENSION IF NOT EXISTS ${ext}`); add('ok', `Extension ${ext}`); }
      catch (e) { add('err', `Extension ${ext} could not be enabled (${e.message}). Ask your host to run: CREATE EXTENSION ${ext}; in database ${f.dbName}`); }
    }
    try { await owner.query('CREATE EXTENSION IF NOT EXISTS vector'); add('ok', 'Extension vector (semantic AI search)'); }
    catch { add('warn', 'Extension vector is not available — optional. AI search uses full-text search instead.'); }
    const canCreate = (await owner.query(`SELECT has_schema_privilege('public', 'CREATE') AS t, has_database_privilege(current_database(), 'CREATE') AS d`)).rows[0];
    if (!canCreate.t || !canCreate.d) add('err', `The owner user "${f.ownerUser}" cannot create tables in this database. Use your main cPanel account user (it owns the database) as the owner user, or ask your host to run: GRANT CREATE ON SCHEMA public TO ${f.ownerUser};`);
    const own = (await owner.query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user')).rows[0];
    if (own.rolsuper) add('warn', 'The owner user is a superuser. That works, but a normal user is safer.');
    const existing = (await owner.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`)).rows[0].n;
    const migrated = (await owner.query(`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS m`)).rows[0].m;
    if (existing && !migrated) add('err', `The database already contains ${existing} other tables. Use a new, empty database.`);
    else if (migrated) add('warn', 'The database already has Knowledge Gate tables — they will be upgraded, not erased.');
  } catch (e) { add('err', `Cannot connect as the owner user: ${e.message}`); }
  finally { await owner.end().catch(() => {}); }
  const app = new Client({ connectionString: dbUrl(f.appUser, f.appPass, f), connectionTimeoutMillis: 8000 });
  try {
    await app.connect();
    const r = (await app.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
    if (r.rolsuper || r.rolbypassrls) add('err', 'The app user must not be a superuser or bypass row-level security. Create a normal user for the app.');
    else add('ok', 'App user is restricted (row-level security applies)');
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(f.appUser)) add('err', 'The app user name must be lowercase letters, digits and underscores');
  } catch (e) { add('err', `Cannot connect as the app user: ${e.message}`); }
  finally { await app.end().catch(() => {}); }
  for (const tool of ['pdftoppm', 'tesseract']) {
    const found = (process.env.PATH || '').split(':').some((d) => d && fs.existsSync(path.join(d, tool)));
    if (!found) { add('warn', 'OCR tools (pdftoppm, tesseract) are not installed. Scanned PDF pages cannot be read. Books with selectable text work normally.'); break; }
  }
  return out;
}

async function install(f) {
  const https = /^https:/i.test(f.siteUrl);
  let dbEnv;
  if (f.dbMode !== 'external') {
    const edb = require('./embedded-db');
    const p = await edb.create(f.dbUser ? { superUser: f.dbUser, superPass: f.dbPass } : {});
    dbEnv = { DB_MODE: 'embedded', PG_SUPER_USER: p.superUser, PG_SUPER_PASSWORD: p.superPass, DATABASE_OWNER_URL: edb.url('edubooks', p.ownerPass), DATABASE_URL: edb.url('edubooks_app', p.appPass), DB_POOL_MAX: '10', BACKUP_HOUR: '2', BACKUP_KEEP: '7' };
  } else {
    dbEnv = { DB_MODE: 'external', DATABASE_OWNER_URL: dbUrl(f.ownerUser, f.ownerPass, f), DATABASE_URL: dbUrl(f.appUser, f.appPass, f), DB_APP_ROLE: f.appUser };
  }
  const env = {
    NODE_ENV: 'production',
    ...dbEnv,
    FILE_URL_SECRET: crypto.randomBytes(32).toString('base64url'),
    COOKIE_SECURE: https ? '1' : '0',
    STORAGE_DRIVER: 'local',
    STORAGE_DIR: path.join(ROOT, 'storage'),
    MAX_UPLOAD_MB: '100',
    LOG_FORMAT: 'json',
    // Shared hosting may hide client IPs behind the web server, so IP limits are generous; account lockout stops password guessing.
    LOGIN_RATE_LIMIT: '600',
    RATE_LIMIT_PER_IP_PER_MIN: '30000',
    AI_PROVIDER: f.ai || 'offline',
    ...(f.ai === 'openai-compatible' && f.aiUrl ? { AI_BASE_URL: f.aiUrl } : {}),
    ...(f.aiKey ? { AI_API_KEY: f.aiKey } : {}),
  };
  const text = '# Written by the Knowledge Gate installer. Keep this file private.\n' + Object.entries(env).map(([k, v]) => `${k}=${q(v)}`).join('\n') + '\n';
  fs.writeFileSync(ENV_FILE, text, { mode: 0o600 });
  const steps = f.dbMode !== 'external' ? ['Built-in database created (private socket, no network access)'] : [];
  await run(path.join(API, 'dist', 'db', 'migrate.js'), env); steps.push('Database tables, security policies and functions created');
  if (f.demo) {
    await run(path.join(API, 'dist', 'db', 'seed.js'), env); steps.push('Demo data loaded (publisher admin: admin / Admin@12345 — change it)');
  } else {
    await run(path.join(API, 'dist', 'db', 'setup.js'), { ...env, PUBLISHER_NAME: f.publisher, ADMIN_USERNAME: f.adminUser || 'admin', ADMIN_PASSWORD: f.adminPass });
    steps.push(`Publisher “${f.publisher}” and admin “${f.adminUser || 'admin'}” created`);
  }
  fs.writeFileSync(LOCK_FILE, `installed ${new Date().toISOString()}\n`, { mode: 0o600 });
  fs.rmSync(KEY_FILE, { force: true });
  return steps;
}

function installer() {
  const key = installKey();
  let busy = false;
  return async (req, res) => {
    const send = (code, html) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }); res.end(html); };
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ statusCode: 503, message: 'Knowledge Gate is not installed yet. Open the website to run the installer.' })); }
    if (req.method !== 'POST' || url.pathname !== '/install') return send(200, form());
    if (busy) return send(409, page('Installing', '<div class="card"><h1>Installation is already running…</h1><p>Wait a minute, then reload.</p></div>'));
    let f;
    try { f = await readBody(req); } catch { return send(413, form({}, ['Request too large'])); }
    const a = Buffer.from(String(f.key || '').trim()); const b = Buffer.from(key);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(403, form(f, ['The installer key is not correct. Copy it from install-key.txt in the app folder.']));
    const errors = [];
    if (!f.demo) {
      if (!f.publisher?.trim()) errors.push('Enter your publisher name (or choose demo data)');
      if (!f.adminPass || f.adminPass.length < 10) errors.push('The admin password needs at least 10 characters');
      if (!/^[a-z0-9._-]{3,40}$/.test(f.adminUser || 'admin')) errors.push('Admin username: 3–40 lowercase letters, digits, dot, dash or underscore');
    }
    if (f.ai === 'openai-compatible' && !/^https?:\/\//.test(f.aiUrl || '')) errors.push('Enter the model server URL for the self-hosted AI');
    if (f.ai === 'anthropic' && !f.aiKey) errors.push('Enter the Anthropic API key, or choose Offline drafts');
    if (errors.length) return send(400, form(f, errors));
    busy = true;
    try {
      const checks = await preflight(f);
      const list = `<ul class="res">${checks.map((c) => `<li class="${c.level}">${c.level === 'ok' ? '✅' : c.level === 'warn' ? '⚠️' : '❌'} ${esc(c.text)}</li>`).join('')}</ul>`;
      if (checks.some((c) => c.level === 'err')) return send(400, form(f, ['Please fix the problems below and try again.', ...checks.filter((c) => c.level === 'err').map((c) => c.text)]));
      const steps = await install(f);
      send(200, page('Knowledge Gate installed', `<div class="card"><div class="logo">🎉</div><h1>Knowledge Gate is installed!</h1>${list}
<ul class="res">${steps.map((s) => `<li class="ok">✅ ${esc(s)}</li>`).join('')}</ul>
<p>The app is starting now. In a few seconds, <a href="/login">open the sign-in page</a> and choose <strong>Publisher staff</strong>.</p>
<p>Next: set up a daily backup (see the README) and enable the <strong>AutoSSL</strong> certificate for this domain if it is not already active.</p></div>`));
      bootApp().catch((e) => { console.error('Start failed after install:', e); handler = (rq, rs) => { rs.statusCode = 500; rs.end('Knowledge Gate was installed but could not start. Restart the app in cPanel → Setup Node.js App, and check the log file.'); }; });
    } catch (e) {
      send(500, form(f, [`Installation failed: ${e.message}`]));
    } finally { busy = false; }
  };
}

// ---------- automatic install (answers written by the public_html setup wizard) ----------
const AUTO_FILE = path.join(ROOT, 'autoinstall.json');
const STATUS_FILE = path.join(ROOT, 'install-status.json');
const writeStatus = (st) => fs.writeFileSync(STATUS_FILE, JSON.stringify({ ...st, at: new Date().toISOString() }), { mode: 0o600 });
const readStatus = () => { try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { return null; } };

async function autoInstall() {
  let fd;
  try { fd = fs.openSync(path.join(ROOT, 'install.running'), 'wx'); } catch { return false; } // another app process is installing
  let f;
  try {
    f = JSON.parse(fs.readFileSync(AUTO_FILE, 'utf8'));
    fs.rmSync(AUTO_FILE, { force: true }); // passwords do not stay on disk
    writeStatus({ state: 'installing', message: 'Checking the server…' });
    const checks = await preflight({ ...f, dbMode: 'embedded' });
    const bad = checks.filter((c) => c.level === 'err');
    if (bad.length) throw new Error(bad.map((c) => c.text).join(' • '));
    writeStatus({ state: 'installing', message: 'Creating the database and your account…' });
    const steps = await install({ ...f, dbMode: 'embedded' });
    writeStatus({ state: 'installing', message: 'Starting Knowledge Gate…', steps });
    await bootApp();
    writeStatus({ state: 'done', steps });
  } catch (e) {
    console.error('Automatic install failed:', e);
    writeStatus({ state: 'error', message: String(e.message || e) });
    if (!fs.existsSync(LOCK_FILE)) handler = installer();
  } finally { fs.closeSync(fd); fs.rmSync(path.join(ROOT, 'install.running'), { force: true }); }
  return true;
}

/** Wraps a handler so the wizard's progress page can poll /install-status while installing. */
function withStatus(h) {
  return (req, res) => {
    if (req.url.split('?')[0] === '/install-status') {
      const st = fs.existsSync(LOCK_FILE) && handler !== null && readStatus()?.state !== 'installing' ? { state: 'done' } : readStatus() || { state: 'waiting' };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(st));
    }
    return h(req, res);
  };
}
const busyPage = (req, res) => {
  if (req.url.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' }); return res.end('{"statusCode":503,"message":"Knowledge Gate is being installed"}'); }
  res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '5' });
  res.end(page('Installing Knowledge Gate', '<div class="card"><div class="logo">⏳</div><h1>Knowledge Gate is being installed…</h1><p>This takes about a minute. This page reloads by itself.</p><script>setTimeout(()=>location.reload(),4000)</script></div>'));
};

// ---------- start ----------
server.listen(process.env.PORT || 3000, () => console.log(`Knowledge Gate listening (${fs.existsSync(LOCK_FILE) ? 'app' : 'installer'} mode)`));
if (fs.existsSync(LOCK_FILE)) {
  bootApp().catch((e) => {
    console.error('Knowledge Gate failed to start:', e);
    try { if (require('./updater').onBootFailure(e, log)) { handler = busyPage; return; } } catch (e2) { console.error('Automatic rollback failed:', e2); }
    handler = (req, res) => { res.statusCode = 500; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('Knowledge Gate could not start. Check the application log in cPanel (stderr.log) and the .env settings, then restart the app.'); };
  });
} else if (fs.existsSync(AUTO_FILE) || fs.existsSync(path.join(ROOT, 'install.running'))) {
  handler = withStatus(busyPage);
  const original = bootApp;
  autoInstall().then((mine) => {
    if (!mine) { // another process is installing: wait for it, then start normally
      const t = setInterval(() => {
        if (fs.existsSync(LOCK_FILE)) { clearInterval(t); original().catch((e) => console.error(e)); }
        else if (readStatus()?.state === 'error') { clearInterval(t); handler = withStatus(installer()); }
      }, 2000);
    }
  });
} else {
  handler = withStatus(installer());
}
