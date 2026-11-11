// Builds the cPanel package:  node packaging/cpanel/build.mjs   →  dist-cpanel/edubooks-lms-cpanel.zip
// The zip contains pre-built code only (no node_modules): cPanel's "Run NPM Install" installs the packages.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const OUT = path.join(ROOT, 'dist-cpanel');
const STAGE = path.join(OUT, 'edubooks-lms');
const sh = (cmd, cwd = ROOT, env = {}) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
const copy = (from, to, filter) => fs.cpSync(path.join(ROOT, from), path.join(STAGE, to), { recursive: true, filter });

console.log('▶ Building API and web app');
sh('npm run build -w apps/api');
sh('npm run build -w apps/web', ROOT, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' });

console.log('▶ Staging files');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
copy('packaging/cpanel/app.js', 'app.js');
copy('packaging/cpanel/embedded-db.js', 'embedded-db.js');
copy('packaging/cpanel/README.md', 'README.md');
copy('apps/api/dist', 'api/dist', (src) => !src.endsWith('.tsbuildinfo'));
copy('apps/api/drizzle', 'api/drizzle');
copy('apps/api/scripts/extract-pdf-text.mjs', 'api/scripts/extract-pdf-text.mjs');
copy('apps/web/.next', 'web/.next', (src) => !/[\\/]\.next[\\/](cache|standalone|trace)/.test(src) && !src.endsWith('.nft.json'));
copy('apps/web/public', 'web/public');
fs.writeFileSync(path.join(STAGE, 'web', 'next.config.js'), "module.exports = { poweredByHeader: false };\n");
fs.mkdirSync(path.join(STAGE, 'storage'));
fs.writeFileSync(path.join(STAGE, 'storage', '.keep'), '');

// One package.json with the exact versions used in the build (API + web runtime dependencies).
const versionOf = (name, from) => {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const p = path.join(dir, 'node_modules', name, 'package.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')).version;
    if (dir === path.dirname(dir)) throw new Error(`${name} is not installed`);
  }
};
const deps = {};
for (const w of ['api', 'web']) for (const name of Object.keys(require(path.join(ROOT, 'apps', w, 'package.json')).dependencies)) {
  deps[name] = versionOf(name, path.join(ROOT, 'apps', w));
}
deps.express = versionOf('express', path.join(ROOT, 'node_modules', '@nestjs', 'platform-express'));
const rootPkg = require(path.join(ROOT, 'package.json'));
const version = require(path.join(ROOT, 'apps', 'api', 'package.json')).version || '1.0.0';
fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({
  name: 'edubooks-lms', version, private: true, description: 'EduBooks LMS — cPanel package', main: 'app.js',
  scripts: { start: 'node app.js' }, engines: { node: '>=20' },
  dependencies: Object.fromEntries(Object.entries(deps).sort()),
  // Built-in PostgreSQL 16 for hosting without PostgreSQL (Linux x64 servers, which is what cPanel runs on).
  optionalDependencies: { '@embedded-postgres/linux-x64': '16.14.0-beta.17' },
  overrides: rootPkg.overrides ?? {},
}, null, 2) + '\n');

console.log('▶ Resolving the lockfile (and checking that a clean install works)');
sh('npm install --omit=dev --no-audit --no-fund --ignore-scripts=false', STAGE);
sh('npm audit --omit=dev --audit-level=high', STAGE);
fs.rmSync(path.join(STAGE, 'node_modules'), { recursive: true, force: true }); // cPanel creates node_modules itself

console.log('▶ Zipping');
const zip = path.join(OUT, 'edubooks-lms-cpanel.zip');
sh(`zip -qr ${JSON.stringify(zip)} edubooks-lms`, OUT);
console.log(`✅ ${path.relative(ROOT, zip)} (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)`);
