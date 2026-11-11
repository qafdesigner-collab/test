/*
 * Knowledge Gate self-updater (cPanel / single-folder installs).
 *
 *  stage(zip)  – unpacks an update package into updates/staging and checks it
 *  apply()     – safety backup of the database, swaps the code, restarts the app
 *  onBoot*()   – after the restart: confirms the update, or rolls the code back automatically
 *  rollback()  – manual return to the previous version (code + database as it was before the update)
 *
 * Database changes are applied by the normal start-up migrations, which run in one transaction:
 * if they fail, the database is unchanged and the previous code is put back.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DIR = path.join(ROOT, 'updates');
const STAGING = path.join(DIR, 'staging');
const PREVIOUS = path.join(ROOT, '.previous-version');
const STATE = path.join(DIR, 'state.json');
const HISTORY = path.join(DIR, 'history.json');
const PENDING = path.join(DIR, 'pending-boot.json');
// Everything that belongs to the program. Data (.env, pgdata, storage, backups, logs) is never touched.
const PARTS = ['api', 'web', 'node_modules', 'runtime', 'app.js', 'embedded-db.js', 'updater.js', 'package.json', 'package-lock.json', 'README.md', 'BUILD_ID'];
const MAX_UNPACKED = 3 * 1024 ** 3;

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2), { mode: 0o600 }); };
const buildOf = (dir) => { try { return fs.readFileSync(path.join(dir, 'BUILD_ID'), 'utf8').trim(); } catch { return 'unknown'; } };
const sha = (f) => (fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null);
const setState = (s) => writeJson(STATE, { ...s, at: new Date().toISOString() });
function addHistory(entry) {
  const h = readJson(HISTORY, []);
  h.unshift({ ...entry, at: new Date().toISOString() });
  writeJson(HISTORY, h.slice(0, 50));
}
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });

function status() {
  return {
    current: buildOf(ROOT),
    previous: fs.existsSync(path.join(PREVIOUS, 'BUILD_ID')) ? buildOf(PREVIOUS) : null,
    state: readJson(STATE),
    history: readJson(HISTORY, []),
  };
}

/** Unzips safely (no paths outside the target, size and entry limits). */
function unzip(zipFile, dest) {
  const yauzl = require('yauzl');
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true, validateEntrySizes: true }, (err, zip) => {
      if (err) return reject(new Error('This is not a valid zip file.'));
      let total = 0, count = 0;
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (e) => {
        const name = e.fileName.replace(/\\/g, '/');
        const out = path.resolve(dest, name);
        if (name.startsWith('/') || name.split('/').includes('..') || !out.startsWith(path.resolve(dest) + path.sep)) return reject(new Error(`Unsafe path in package: ${name}`));
        if (++count > 200_000 || (total += e.uncompressedSize) > MAX_UNPACKED) return reject(new Error('The package is too large.'));
        if (name.endsWith('/')) { fs.mkdirSync(out, { recursive: true }); return zip.readEntry(); }
        const mode = (e.externalFileAttributes >>> 16) & 0o777;
        if (((e.externalFileAttributes >>> 16) & 0o170000) === 0o120000) return zip.readEntry(); // skip symlinks
        fs.mkdirSync(path.dirname(out), { recursive: true });
        zip.openReadStream(e, (er, rs) => {
          if (er) return reject(er);
          const ws = fs.createWriteStream(out, { mode: mode & 0o111 ? 0o755 : 0o644 });
          rs.on('error', reject); ws.on('error', reject);
          ws.on('close', () => zip.readEntry());
          rs.pipe(ws);
        });
      });
      zip.readEntry();
    });
  });
}

/** Unpacks and checks an update package. Accepts the full public_html zip or the small update zip. */
async function stage(zipFile) {
  const st = readJson(STATE);
  if (st && ['applying', 'restarting'].includes(st.state)) throw new Error('An update is already running.');
  rm(STAGING); fs.mkdirSync(STAGING, { recursive: true });
  try {
    await unzip(zipFile, STAGING);
  } finally { rm(zipFile); }
  const base = [STAGING, path.join(STAGING, 'edubooks-app')].find((d) => fs.existsSync(path.join(d, 'app.js')) && fs.existsSync(path.join(d, 'BUILD_ID')));
  if (!base) { rm(STAGING); throw new Error('This is not an Knowledge Gate update package (app.js / BUILD_ID not found).'); }
  for (const must of ['api/dist/main.js', 'api/drizzle/meta/_journal.json', 'web/.next/BUILD_ID']) {
    if (!fs.existsSync(path.join(base, must))) { rm(STAGING); throw new Error(`The package is incomplete (${must} is missing).`); }
  }
  const build = buildOf(base);
  const hasModules = fs.existsSync(path.join(base, 'node_modules'));
  if (!hasModules && sha(path.join(base, 'package-lock.json')) !== sha(path.join(ROOT, 'package-lock.json'))) {
    rm(STAGING);
    throw new Error('This update needs new program libraries. Please upload the FULL package (edubooks-lms-public_html.zip) instead of the small update package.');
  }
  const migrations = (readJson(path.join(base, 'api/drizzle/meta/_journal.json'), { entries: [] }).entries || []).length;
  const installedMigrations = (readJson(path.join(ROOT, 'api/drizzle/meta/_journal.json'), { entries: [] }).entries || []).length;
  const info = { build, current: buildOf(ROOT), base: path.relative(ROOT, base), hasModules, newDatabaseChanges: Math.max(0, migrations - installedMigrations) };
  if (migrations < installedMigrations) { rm(STAGING); throw new Error('This package is OLDER than the installed version. Use "Roll back" to return to the previous version instead.'); }
  setState({ state: 'staged', ...info });
  return info;
}

/** Applies the staged update. The caller must have answered the HTTP request already: this stops the database briefly and restarts the app. */
async function apply(log = () => {}) {
  const st = readJson(STATE);
  if (!st || st.state !== 'staged') throw new Error('Nothing to apply. Upload an update package first.');
  const base = path.join(ROOT, st.base);
  setState({ ...st, state: 'applying', step: 'Safety backup of the database' });
  let backupFile = null;
  if (process.env.DB_MODE === 'embedded') {
    try { backupFile = await require('./embedded-db').backup(process.env.PG_SUPER_PASSWORD, Number(process.env.BACKUP_KEEP || 7) + 2); }
    catch (e) { setState({ ...st, state: 'failed', error: `Safety backup failed, nothing was changed: ${e.message}` }); throw e; }
  }
  setState({ ...st, state: 'applying', step: 'Installing the new version' });
  const next = `${PREVIOUS}-new`; rm(next); fs.mkdirSync(next);
  const swapped = [];
  try {
    for (const part of PARTS) {
      if (!fs.existsSync(path.join(base, part))) continue; // not in a small update: keep the installed one
      if (fs.existsSync(path.join(ROOT, part))) fs.renameSync(path.join(ROOT, part), path.join(next, part));
      fs.renameSync(path.join(base, part), path.join(ROOT, part));
      swapped.push(part);
    }
  } catch (e) {
    for (const part of swapped.reverse()) { rm(path.join(ROOT, part)); if (fs.existsSync(path.join(next, part))) fs.renameSync(path.join(next, part), path.join(ROOT, part)); }
    rm(next);
    setState({ ...st, state: 'failed', error: `Could not install the files, nothing was changed: ${e.message}` });
    throw e;
  }
  for (const d of [path.join(ROOT, 'runtime', 'bin'), path.join(ROOT, 'node_modules', '@embedded-postgres', 'linux-x64', 'native', 'bin')])
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) fs.chmodSync(path.join(d, f), 0o755);
  // Keep the version before this one until the new one has started, so a failed update leaves "Roll back" working.
  const OLDER = `${PREVIOUS}-older`; rm(OLDER);
  if (fs.existsSync(PREVIOUS)) fs.renameSync(PREVIOUS, OLDER);
  fs.renameSync(next, PREVIOUS); rm(STAGING);
  writeJson(PENDING, { build: st.build, from: st.current, swapped, backupFile: backupFile && path.basename(backupFile), newDatabaseChanges: st.newDatabaseChanges });
  setState({ ...st, state: 'restarting', step: 'Restarting with the new version' });
  log('info', `Update ${st.current} → ${st.build} installed; restarting`);
  restart();
}

/** Restarts under Passenger (restart.txt) and exits so the next request starts the new code. */
function restart() {
  fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
  const now = new Date(); fs.writeFileSync(path.join(ROOT, 'tmp', 'restart.txt'), now.toISOString()); fs.utimesSync(path.join(ROOT, 'tmp', 'restart.txt'), now, now);
  setTimeout(() => process.exit(0), 1500).unref();
}

/** Called at start-up when the database and website are running again. */
function onBootSuccess(log = () => {}) {
  const p = readJson(PENDING);
  if (!p) return;
  rm(PENDING);
  rm(`${PREVIOUS}-older`);
  if (p.rollback) {
    setState({ state: 'rolled_back', build: buildOf(ROOT), message: p.message || 'Returned to the previous version.' });
    addHistory({ action: 'rollback', from: p.from, to: buildOf(ROOT), result: 'ok', message: p.message });
    return;
  }
  setState({ state: 'done', build: p.build, from: p.from, newDatabaseChanges: p.newDatabaseChanges, backupFile: p.backupFile });
  addHistory({ action: 'update', from: p.from, to: p.build, result: 'ok', newDatabaseChanges: p.newDatabaseChanges, backupFile: p.backupFile });
  log('info', `Update to ${p.build} completed`);
}

/** Called at start-up when the new version could not start: puts the previous code back and restarts. Returns true when it did. */
function onBootFailure(err, log = () => {}) {
  const p = readJson(PENDING);
  if (!p || p.rollback || !fs.existsSync(PREVIOUS)) return false;
  const lines = String((err && err.message) || err).split('\n').map((l) => l.trim()).filter(Boolean);
  const pick = lines.find((l) => /\berror: /i.test(l)) || lines.find((l) => /(error|failed|cannot|syntax)/i.test(l) && !/^at /.test(l)) || lines[0] || 'unknown error';
  const reason = pick.replace(/^.*?\berror: /i, '').slice(0, 400);
  swapBack(p.swapped);
  if (fs.existsSync(`${PREVIOUS}-older`)) fs.renameSync(`${PREVIOUS}-older`, PREVIOUS); // the earlier version stays available for "Roll back"
  writeJson(PENDING, { rollback: true, from: p.build, message: `The new version (${p.build}) could not start, so the previous version was restored automatically. Reason: ${reason}` });
  addHistory({ action: 'update', from: p.from, to: p.build, result: 'failed', message: reason, backupFile: p.backupFile });
  log('error', `Update failed to start (${reason}); previous version restored`);
  restart();
  return true;
}

function swapBack(parts) {
  const failed = path.join(DIR, `failed-${Date.now()}`); fs.mkdirSync(failed, { recursive: true });
  for (const part of parts) {
    if (!fs.existsSync(path.join(PREVIOUS, part))) continue;
    if (fs.existsSync(path.join(ROOT, part))) fs.renameSync(path.join(ROOT, part), path.join(failed, part));
    fs.renameSync(path.join(PREVIOUS, part), path.join(ROOT, part));
  }
  rm(PREVIOUS);
  setTimeout(() => rm(failed), 10_000).unref();
}

/** Manual "Roll back": previous program + the database exactly as it was just before that update. */
function rollback(log = () => {}) {
  if (!fs.existsSync(path.join(PREVIOUS, 'BUILD_ID'))) throw new Error('There is no previous version to return to.');
  const last = (readJson(HISTORY, []).find((h) => h.action === 'update' && h.result === 'ok')) || {};
  const from = buildOf(ROOT); const to = buildOf(PREVIOUS);
  if (last.backupFile && fs.existsSync(path.join(ROOT, 'backups', last.backupFile))) {
    fs.mkdirSync(path.join(ROOT, 'restore'), { recursive: true });
    for (const f of fs.readdirSync(path.join(ROOT, 'restore'))) if (f.endsWith('.tar.gz')) rm(path.join(ROOT, 'restore', f));
    fs.copyFileSync(path.join(ROOT, 'backups', last.backupFile), path.join(ROOT, 'restore', last.backupFile)); // restored at start-up
  }
  swapBack(PARTS);
  writeJson(PENDING, { rollback: true, from, message: `Returned from ${from} to ${to}${last.backupFile ? '; the database was restored from the backup made before that update (changes made since then are not kept)' : ''}.` });
  setState({ state: 'restarting', step: 'Returning to the previous version' });
  log('warn', `Rollback ${from} → ${to}`);
  restart();
}

function cancel() { rm(STAGING); setState({ state: 'idle' }); }

module.exports = { status, stage, apply, rollback, cancel, onBootSuccess, onBootFailure, DIR };
