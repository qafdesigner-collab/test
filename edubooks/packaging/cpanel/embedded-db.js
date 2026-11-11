/*
 * Built-in PostgreSQL for hosting that offers no PostgreSQL (for example MySQL-only cPanel plans).
 * The server runs from the app folder, listens ONLY on a private Unix socket (no network port),
 * and keeps its data in ./pgdata. Row-level security and the two-role setup work exactly as with
 * an external PostgreSQL server.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'pgdata');
const RUN = path.join(ROOT, 'run');           // socket directory
const LOGS = path.join(ROOT, 'logs');
const BACKUPS = path.join(ROOT, 'backups');
const RESTORE = path.join(ROOT, 'restore');
const PORT = 5432;                              // only names the socket file; no TCP listener
const SUPER = 'edubooks_super';

function binDir() {
  const dir = path.join(ROOT, 'node_modules', '@embedded-postgres', `${os.platform()}-${os.arch()}`, 'native', 'bin');
  if (!fs.existsSync(path.join(dir, 'postgres'))) throw new Error(`Built-in PostgreSQL is not installed for ${os.platform()}-${os.arch()}. Click "Run NPM Install" in Setup Node.js App.`);
  return dir;
}

function exec(file, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 120_000, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${path.basename(file)}: ${(stderr || stdout || err.message).trim().split('\n').slice(-4).join(' | ')}`));
      resolve(stdout.trim());
    });
  });
}
const bin = (name, args, opts) => exec(path.join(binDir(), name), args, opts);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Connection string over the private socket. */
function url(user, pass, db = 'edubooks') {
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@localhost:${PORT}/${db}?host=${encodeURIComponent(RUN)}`;
}

const SERVER_OPTS = [
  "-c listen_addresses=''", `-c unix_socket_directories='${RUN}'`, `-c port=${PORT}`, "-c unix_socket_permissions=0700",
  '-c shared_buffers=32MB', '-c max_connections=40', '-c dynamic_shared_memory_type=mmap', '-c huge_pages=off',
  '-c max_wal_size=256MB', '-c log_min_messages=warning', "-c log_line_prefix='%m [%p] '",
].join(' ');

/** Removes lock files left by a crash or server reboot (postgres refuses to start if their PID now belongs to another process). */
function clearStaleLocks() {
  for (const f of [path.join(DATA, 'postmaster.pid'), path.join(RUN, `.s.PGSQL.${PORT}.lock`)]) {
    if (!fs.existsSync(f)) continue;
    const pid = Number(fs.readFileSync(f, 'utf8').split('\n')[0]);
    let alive = false;
    try { alive = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('postgres'); } catch { alive = false; }
    if (!alive) fs.rmSync(f, { force: true });
  }
}

async function canConnect(superPass) {
  const { Client } = require('pg');
  const c = new Client({ connectionString: url(SUPER, superPass, 'postgres'), connectionTimeoutMillis: 3000 });
  try { await c.connect(); await c.query('SELECT 1'); return true; } catch { return false; } finally { await c.end().catch(() => {}); }
}

/** Starts the server if it is not already running (several app processes may share it). */
async function ensureRunning(superPass) {
  if (await canConnect(superPass)) return;
  fs.mkdirSync(RUN, { recursive: true, mode: 0o700 }); fs.mkdirSync(LOGS, { recursive: true });
  clearStaleLocks();
  try {
    // detached: postgres gets its own session, so it is not killed together with one app process
    await bin('pg_ctl', ['-D', DATA, '-l', path.join(LOGS, 'postgres.log'), '-o', SERVER_OPTS, '-w', '-t', '60', 'start'], { detached: true });
  } catch (e) {
    // Another app process may have started it at the same moment.
    for (let i = 0; i < 20; i++) { if (await canConnect(superPass)) return; await sleep(500); }
    throw new Error(`The built-in database could not start: ${e.message}. See logs/postgres.log`);
  }
  for (let i = 0; i < 40; i++) { if (await canConnect(superPass)) return; await sleep(250); }
  throw new Error('The built-in database started but does not accept connections. See logs/postgres.log');
}

async function stop() {
  if (!fs.existsSync(path.join(DATA, 'postmaster.pid'))) return;
  await bin('pg_ctl', ['-D', DATA, '-m', 'fast', '-w', '-t', '60', 'stop']).catch(() => undefined);
}

/** Preflight checks for the built-in database. */
async function check() {
  const out = []; const add = (level, text) => out.push({ level, text });
  if (typeof process.getuid === 'function' && process.getuid() === 0) add('err', 'The app runs as "root". PostgreSQL refuses to run as root. On cPanel this never happens; on a VPS run the app as a normal user.');
  try { add('ok', `Built-in database: ${await bin('postgres', ['--version'])}`); }
  catch (e) { add('err', `Built-in database cannot run on this server: ${e.message}`); }
  try { await exec('tar', ['--version']); add('ok', 'tar is available (used for backups)'); } catch { add('warn', '"tar" is not available, so automatic backups are off. Use cPanel Backup instead.'); }
  try {
    const s = fs.statfsSync(ROOT); const freeMb = (s.bavail * s.bsize) / 1048576;
    add(freeMb > 1024 ? 'ok' : 'warn', `Free disk space: ${Math.round(freeMb)} MB${freeMb > 1024 ? '' : ' — at least 1 GB is recommended'}`);
  } catch { /* statfs not supported */ }
  if (fs.existsSync(DATA) && !fs.existsSync(path.join(ROOT, 'install.lock'))) add('warn', 'An unfinished earlier installation was found. It will be set aside (pgdata-unfinished-…) and a new database created.');
  return out;
}

/** Creates the database cluster, the owner and app roles, the database and extensions. Returns the passwords. */
async function create() {
  if (fs.existsSync(DATA)) { await stop(); fs.renameSync(DATA, `${DATA}-unfinished-${Date.now()}`); }
  const pw = () => crypto.randomBytes(24).toString('base64url');
  const superPass = pw(), ownerPass = pw(), appPass = pw();
  const pwFile = path.join(os.tmpdir(), `eb-${crypto.randomBytes(6).toString('hex')}`);
  fs.writeFileSync(pwFile, superPass + '\n', { mode: 0o600 });
  try {
    await bin('initdb', ['-D', DATA, '-U', SUPER, `--pwfile=${pwFile}`, '--auth-local=scram-sha-256', '--auth-host=reject', '-E', 'UTF8', '--locale=C', '--no-instructions'], { timeout: 300_000 });
  } finally { fs.rmSync(pwFile, { force: true }); }
  fs.chmodSync(DATA, 0o700);
  await ensureRunning(superPass);
  const { Client } = require('pg');
  const admin = new Client({ connectionString: url(SUPER, superPass, 'postgres') });
  await admin.connect();
  try {
    await admin.query(`CREATE ROLE edubooks LOGIN PASSWORD '${ownerPass}'`);
    await admin.query(`CREATE ROLE edubooks_app LOGIN PASSWORD '${appPass}' NOBYPASSRLS`);
    await admin.query('CREATE DATABASE edubooks OWNER edubooks');
  } finally { await admin.end(); }
  const db = new Client({ connectionString: url(SUPER, superPass, 'edubooks') });
  await db.connect();
  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext');
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  } finally { await db.end(); }
  return { superPass, ownerPass, appPass };
}

/**
 * Consistent backup: the database pauses for a few seconds while its folder is archived.
 * Book PDFs and uploads (./storage) are never changed once written, so the normal cPanel
 * home-folder backup copies them safely; they are not repeated here.
 */
async function backup(superPass, keep = Number(process.env.BACKUP_KEEP || 7)) {
  fs.mkdirSync(BACKUPS, { recursive: true, mode: 0o700 });
  const lock = path.join(BACKUPS, '.running');
  let fd;
  try { fd = fs.openSync(lock, 'wx'); } catch {
    if (Date.now() - fs.statSync(lock).mtimeMs < 30 * 60_000) return null; // another app process is doing it
    fs.rmSync(lock, { force: true }); fd = fs.openSync(lock, 'wx');
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
  const file = path.join(BACKUPS, `edubooks-db-${stamp}.tar.gz`);
  try {
    await stop();
    try { await exec('tar', ['-czf', file, '-C', ROOT, '--exclude=pgdata/postmaster.pid', '--exclude=pgdata/pg_dynshmem/*', 'pgdata'], { timeout: 30 * 60_000 }); }
    finally { await ensureRunning(superPass); }
    fs.chmodSync(file, 0o600);
    const all = fs.readdirSync(BACKUPS).filter((f) => /^edubooks-db-.*\.tar\.gz$/.test(f)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(BACKUPS, old), { force: true });
    return file;
  } finally { fs.closeSync(fd); fs.rmSync(lock, { force: true }); }
}

/**
 * Restore: put ONE backup file (edubooks-db-….tar.gz) into the "restore" folder and restart the app.
 * The current database is kept as pgdata-before-restore-… in case you need it.
 */
async function restoreIfRequested(superPassForCheck) {
  if (!fs.existsSync(RESTORE)) return null;
  const files = fs.readdirSync(RESTORE).filter((f) => f.endsWith('.tar.gz'));
  if (!files.length) return null;
  if (files.length > 1) throw new Error('Put exactly one backup file into the "restore" folder.');
  const src = path.join(RESTORE, files[0]);
  const listing = await exec('tar', ['-tzf', src]);
  if (!listing.split('\n').some((l) => l.replace(/^\.\//, '') === 'pgdata/PG_VERSION')) throw new Error(`${files[0]} is not an EduBooks database backup.`);
  await stop();
  const keepAs = `${DATA}-before-restore-${Date.now()}`;
  if (fs.existsSync(DATA)) fs.renameSync(DATA, keepAs);
  try {
    await exec('tar', ['-xzf', src, '-C', ROOT], { timeout: 30 * 60_000 });
    fs.chmodSync(DATA, 0o700);
    fs.rmSync(path.join(DATA, 'postmaster.pid'), { force: true });
    await ensureRunning(superPassForCheck);
  } catch (e) {
    fs.rmSync(DATA, { recursive: true, force: true });
    if (fs.existsSync(keepAs)) fs.renameSync(keepAs, DATA);
    throw new Error(`Restore failed, the previous database was put back: ${e.message}`);
  }
  fs.renameSync(src, path.join(RESTORE, `restored-${files[0]}.done`));
  return { restored: files[0], previous: path.basename(keepAs) };
}

/** Runs backup() once a day at BACKUP_HOUR (server time, default 2). */
function scheduleBackups(superPass, log) {
  if (process.env.BACKUP_HOUR === 'off') return;
  const hour = Number(process.env.BACKUP_HOUR ?? 2);
  const tick = async () => {
    const now = new Date();
    if (now.getHours() !== hour) return;
    const today = path.join(BACKUPS, `.done-${now.toISOString().slice(0, 10)}`);
    if (fs.existsSync(today)) return;
    try {
      const f = await backup(superPass);
      if (f) { fs.writeFileSync(today, ''); log('info', `Backup written: backups/${path.basename(f)}`); }
    } catch (e) { log('error', `Backup failed: ${e.message}`); }
  };
  setInterval(tick, 5 * 60_000).unref();
}

/** Restarts the database if the host stopped it while the app keeps running (skipped while a backup runs). */
function watchdog(superPass, log) {
  setInterval(async () => {
    const lock = path.join(BACKUPS, '.running');
    if (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs < 30 * 60_000) return;
    if (await canConnect(superPass)) return;
    try { await ensureRunning(superPass); log('warn', 'The built-in database had stopped and was restarted'); }
    catch (e) { log('error', e.message); }
  }, 30_000).unref();
}

module.exports = { watchdog, url, check, create, ensureRunning, stop, backup, restoreIfRequested, scheduleBackups, DATA, BACKUPS, RESTORE, SUPER };
