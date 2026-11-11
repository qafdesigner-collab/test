// Builds the "upload to public_html and extract" package:
//   node packaging/public_html/build.mjs   →  dist-cpanel/edubooks-lms-public_html.zip
// Contents: index.php (setup wizard) + edubooks-app/ (the app with all packages installed,
// the built-in PostgreSQL and a Node.js runtime). No "npm install" is needed on the server.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const OUT = path.join(ROOT, 'dist-cpanel');
const STAGE = path.join(OUT, 'public_html');
const APP = path.join(STAGE, 'edubooks-app');
const NODE_RUNTIME = 'node-linux-x64@22.23.3'; // same major version the app is built and tested with
const sh = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log('▶ Building the app package');
sh('node packaging/cpanel/build.mjs');

console.log('▶ Installing packages for Linux x64 (as on cPanel servers)');
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
fs.cpSync(path.join(OUT, 'edubooks-lms'), APP, { recursive: true });
sh('npm ci --omit=dev --no-audit --no-fund', APP);
// Not needed at runtime: the website is pre-built (no compiler), no image optimisation, no CLI shims.
for (const p of ['node_modules/.bin', 'node_modules/@next/swc-linux-x64-gnu', 'node_modules/@next/swc-linux-x64-musl', 'node_modules/@img', 'node_modules/sharp', 'node_modules/typescript',
  // Bundled into the pre-built website or only optional (pdf.js rendering canvas is not used on the server):
  'node_modules/@napi-rs', 'node_modules/lucide-react', 'node_modules/@radix-ui', 'node_modules/@tanstack', 'node_modules/clsx'])
  fs.rmSync(path.join(APP, p), { recursive: true, force: true });

console.log('▶ Adding the Node.js runtime');
const tmp = fs.mkdtempSync(path.join(OUT, 'node-'));
sh(`npm pack ${NODE_RUNTIME} --silent`, tmp);
const tgz = fs.readdirSync(tmp).find((f) => f.endsWith('.tgz'));
sh(`tar -xzf ${tgz}`, tmp);
fs.mkdirSync(path.join(APP, 'runtime', 'bin'), { recursive: true });
fs.copyFileSync(path.join(tmp, 'package', 'bin', 'node'), path.join(APP, 'runtime', 'bin', 'node'));
fs.chmodSync(path.join(APP, 'runtime', 'bin', 'node'), 0o755);
for (const f of ['LICENSE', 'README.md']) if (fs.existsSync(path.join(tmp, 'package', f))) fs.copyFileSync(path.join(tmp, 'package', f), path.join(APP, 'runtime', `node-${f}`));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('  ' + execSync(`${path.join(APP, 'runtime', 'bin', 'node')} -v`).toString().trim());

console.log('▶ Adding the setup wizard');
fs.copyFileSync(path.join(ROOT, 'packaging', 'public_html', 'index.php'), path.join(STAGE, 'index.php'));
fs.copyFileSync(path.join(ROOT, 'packaging', 'public_html', 'INSTALL.txt'), path.join(STAGE, 'EDUBOOKS-INSTALL.txt'));
// While the app sits inside public_html (before the wizard moves it out), nothing in it may be downloaded.
// It only matches /edubooks-app/ paths, so even if this file is moved up into the site's main folder it
// cannot lock the whole website (it would then simply match nothing).
fs.writeFileSync(path.join(APP, '.htaccess'), '# EduBooks: block downloads from this folder until the setup wizard moves it\nRewriteEngine On\nRewriteCond %{REQUEST_URI} ^/edubooks-app(/|$)\nRewriteRule ^ - [F,L]\n');

console.log('▶ Zipping (symbolic links are stored as normal files so any unzip tool works)');
const zip = path.join(OUT, 'edubooks-lms-public_html.zip');
fs.rmSync(zip, { force: true });
sh(`zip -qr -9 ${JSON.stringify(zip)} index.php EDUBOOKS-INSTALL.txt edubooks-app`, STAGE);
console.log(`✅ ${path.relative(ROOT, zip)} (${(fs.statSync(zip).size / 1048576).toFixed(0)} MB)`);
