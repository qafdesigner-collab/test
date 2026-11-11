<?php
/*
 * EduBooks LMS — setup wizard for cPanel.
 * Upload the zip into your domain's root folder (public_html), extract it, and open your domain.
 * The wizard checks the server, asks for the super admin and database login, moves the app
 * OUT of public_html (so no app file can ever be downloaded), connects the domain to it and installs it.
 */
declare(strict_types=1);
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);
ini_set('display_errors', '0');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

const APP_DIR_NAME = 'edubooks-app';
const MARK_BEGIN = '# BEGIN EduBooks LMS';
const MARK_END = '# END EduBooks LMS';

$docroot = __DIR__;
$payload = $docroot . '/' . APP_DIR_NAME;
$home = detect_home($docroot);
$target = $home . '/' . APP_DIR_NAME;

session_name('eb_setup');
session_start(['cookie_httponly' => true, 'cookie_samesite' => 'Strict', 'cookie_secure' => is_https()]);
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));

function is_https(): bool { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') || (($_SERVER['SERVER_PORT'] ?? '') === '443'); }
function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function site_url(): string { return (is_https() ? 'https' : 'http') . '://' . preg_replace('/[^A-Za-z0-9.\-:\[\]]/', '', $_SERVER['HTTP_HOST'] ?? 'localhost'); }

function detect_home(string $docroot): string {
  if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
    $pw = @posix_getpwuid(posix_geteuid());
    if (!empty($pw['dir']) && is_dir($pw['dir']) && strpos($docroot, rtrim($pw['dir'], '/') . '/') === 0) return rtrim($pw['dir'], '/');
  }
  if (preg_match('#^(/home\d*/[^/]+)/#', $docroot . '/', $m)) return $m[1];
  return dirname($docroot);
}

/** Node.js binaries to try: the one shipped in the package first, then those cPanel/CloudLinux install. */
function node_candidates(string $appDir): array {
  $list = [$appDir . '/runtime/bin/node'];
  foreach (['24', '22', '20'] as $v) {
    $list[] = "/opt/alt/alt-nodejs$v/root/usr/bin/node";
    $list[] = "/opt/cpanel/ea-nodejs$v/bin/node";
  }
  foreach (['/usr/local/bin/node', '/usr/bin/node'] as $p) $list[] = $p;
  return array_values(array_filter($list, fn($p) => @is_file($p)));
}

function passenger_block(string $appRoot, string $node, string $baseUri): string {
  return MARK_BEGIN . " (written by the setup wizard)\n"
    . "PassengerAppRoot \"$appRoot\"\nPassengerBaseURI \"$baseUri\"\nPassengerNodejs \"$node\"\n"
    . "PassengerAppType node\nPassengerStartupFile app.js\n" . MARK_END . "\n";
}

function rrmdir(string $dir): void {
  if (!is_dir($dir) || is_link($dir)) { @unlink($dir); return; }
  foreach (scandir($dir) as $f) if ($f !== '.' && $f !== '..') rrmdir("$dir/$f");
  @rmdir($dir);
}

/** Makes sure the programs inside the package can run (some unzip tools drop the "executable" flag). */
function make_executable(string $appDir): void {
  $dirs = [$appDir . '/runtime/bin', $appDir . '/node_modules/@embedded-postgres/linux-x64/native/bin'];
  foreach ($dirs as $d) if (is_dir($d)) foreach (scandir($d) as $f) if ($f !== '.' && $f !== '..') @chmod("$d/$f", 0755);
}

/**
 * Real test: runs a tiny Node.js app through the web server (Phusion Passenger), exactly like EduBooks will run.
 * Returns [ok(bool), node(string), detail(string)].
 */
function passenger_test(string $docroot, string $home, string $payload): array {
  if (!function_exists('curl_init')) return [false, '', 'PHP curl is not available, so the server test cannot run.'];
  make_executable($payload);
  $testApp = $home . '/.edubooks-passenger-test';
  $testDir = $docroot . '/eb-passenger-test';
  @mkdir($testApp, 0700, true); @mkdir($testDir, 0755, true);
  file_put_contents("$testApp/app.js", "require('http').createServer((q,s)=>{s.end('EDUBOOKS-OK '+process.version)}).listen(process.env.PORT||3000);\n");
  $tried = []; $result = [false, '', ''];
  foreach (node_candidates($payload) as $node) {
    file_put_contents("$testDir/.htaccess", passenger_block($testApp, $node, '/eb-passenger-test'));
    [$code, $body, $err] = self_request('/eb-passenger-test/?t=' . bin2hex(random_bytes(4)));
    if (strpos($body, 'EDUBOOKS-OK v') !== false) {
      $ver = (int)substr(trim(substr($body, strpos($body, 'EDUBOOKS-OK v') + 13)), 0, 2);
      if ($ver >= 20) { $result = [true, $node, trim($body)]; break; }
      $tried[] = "$node (too old: v$ver)"; continue;
    }
    $tried[] = $node . ($err ? " (no answer: $err)" : " (HTTP $code)");
    if ($code === 0) { $result = [false, '', "The server could not reach its own website ($err)."]; break; }
  }
  rrmdir($testDir); rrmdir($testApp);
  if (!$result[0] && !$result[2]) $result[2] = 'Node.js apps did not run through the web server. Tried: ' . implode('; ', $tried ?: ['no Node.js found']);
  return $result;
}

function self_request(string $path): array {
  $url = site_url() . $path;
  $ch = curl_init($url);
  $host = parse_url($url, PHP_URL_HOST); $port = parse_url($url, PHP_URL_PORT) ?: (is_https() ? 443 : 80);
  $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 90, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => 0, CURLOPT_FOLLOWLOCATION => false];
  if (!empty($_SERVER['SERVER_ADDR'])) $opts[CURLOPT_RESOLVE] = ["$host:$port:" . $_SERVER['SERVER_ADDR']]; // talk to this server directly
  curl_setopt_array($ch, $opts);
  $body = (string)curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch);
  curl_close($ch);
  return [$code, $body, $err];
}

function checks(string $docroot, string $home, string $payload, string $target): array {
  $c = [];
  $c[] = [version_compare(PHP_VERSION, '7.4', '>=') ? 'ok' : 'err', 'PHP ' . PHP_VERSION . ' (for this setup wizard)'];
  $c[] = [is_file("$payload/app.js") ? 'ok' : 'err', is_file("$payload/app.js") ? 'EduBooks files found' : 'The folder "' . APP_DIR_NAME . '" is missing. Extract the whole zip into this folder.'];
  $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
  $c[] = [in_array($path, ['/', '/index.php'], true) ? 'ok' : 'err', in_array($path, ['/', '/index.php'], true) ? 'Installed at the root of ' . h($_SERVER['HTTP_HOST'] ?? '') : 'EduBooks must be installed in the ROOT folder of a domain or subdomain (not in a sub-folder).'];
  $c[] = [is_writable($home) ? 'ok' : 'err', is_writable($home) ? 'Home folder is writable' : "Cannot write to your home folder ($home)"];
  $c[] = [is_writable($docroot) ? 'ok' : 'err', is_writable($docroot) ? 'Website folder is writable' : 'Cannot write to this folder'];
  $free = @disk_free_space($home);
  if ($free !== false) $c[] = [$free > 1.5e9 ? 'ok' : 'warn', 'Free disk space: ' . round($free / 1e9, 1) . ' GB' . ($free > 1.5e9 ? '' : ' (at least 1.5 GB is recommended)')];
  if (is_file("$target/install.lock")) $c[] = ['err', 'EduBooks is already installed in ' . $target . '. To reinstall, delete or rename that folder first.'];
  return $c;
}

// ---------------------------------------------------------------- page layout
function layout(string $title, int $step, string $body): void {
  $steps = ['Check', 'Super admin', 'Database', 'Install'];
  $nav = '';
  foreach ($steps as $i => $s) $nav .= '<li class="' . ($i + 1 < $step ? 'done' : ($i + 1 === $step ? 'now' : '')) . '"><b>' . ($i + 1 < $step ? '✓' : $i + 1) . '</b>' . h($s) . '</li>';
  echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . h($title) . ' · EduBooks setup</title><style>
:root{--brand:#4338ca;--ink:#1e293b;--muted:#475569}*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:linear-gradient(135deg,#fef3c7,#e0e7ff 45%,#fce7f3);color:var(--ink);min-height:100vh}
main{max-width:680px;margin:0 auto;padding:28px 16px}.top{display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px;color:#6d28d9;margin-bottom:18px}
ol.steps{display:flex;gap:6px;list-style:none;padding:0;margin:0 0 18px;flex-wrap:wrap}ol.steps li{flex:1;min-width:120px;background:#ffffffaa;border-radius:12px;padding:8px 10px;font-size:14px;color:var(--muted);display:flex;gap:8px;align-items:center}
ol.steps b{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#e2e8f0;color:#334155;font-size:13px}
ol.steps li.now{background:#fff;color:var(--ink);font-weight:700}ol.steps li.now b{background:var(--brand);color:#fff}ol.steps li.done b{background:#15803d;color:#fff}
.card{background:#fff;border-radius:20px;box-shadow:0 10px 30px rgba(67,56,202,.12);padding:26px}
h1{margin:0 0 6px;font-size:26px}p{color:var(--muted);line-height:1.55}label{display:block;font-weight:600;font-size:14px;margin:14px 0 4px}small{color:var(--muted);font-weight:400}
input{width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px}input:focus{outline:3px solid #a5b4fc;border-color:var(--brand)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:560px){.row{grid-template-columns:1fr}}
.btns{display:flex;justify-content:space-between;gap:10px;margin-top:26px}
.btn{display:inline-block;background:var(--brand);color:#fff;border:0;border-radius:12px;padding:13px 22px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none}.btn.ghost{background:#eef2ff;color:var(--brand)}
ul.res{list-style:none;padding:0;margin:14px 0}ul.res li{padding:9px 12px;border-radius:10px;margin:6px 0;background:#f8fafc}
.ok{border-left:5px solid #15803d}.warn{border-left:5px solid #b45309}.err{border-left:5px solid #b91c1c}
.note{background:#eef2ff;border-radius:12px;padding:12px 14px;color:#3730a3;font-size:14px;line-height:1.5}
.check{display:flex;gap:8px;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:4px}
code{background:#eef2ff;padding:2px 6px;border-radius:6px}.bar{height:12px;border-radius:99px;background:#e2e8f0;overflow:hidden;margin:18px 0}.bar i{display:block;height:100%;width:30%;background:linear-gradient(90deg,#6366f1,#ec4899);border-radius:99px;animation:mv 1.4s ease-in-out infinite}
@keyframes mv{0%{margin-left:-30%}100%{margin-left:100%}}
</style></head><body><main><div class="top">📚 EduBooks LMS setup</div><ol class="steps">' . $nav . '</ol>' . $body . '</main></body></html>';
  exit;
}
function hidden(): string { return '<input type="hidden" name="csrf" value="' . h($_SESSION['csrf']) . '">'; }
function list_html(array $rows): string {
  $o = '<ul class="res">';
  foreach ($rows as [$lvl, $txt]) $o .= '<li class="' . $lvl . '">' . ($lvl === 'ok' ? '✅' : ($lvl === 'warn' ? '⚠️' : '❌')) . ' ' . $txt . '</li>';
  return $o . '</ul>';
}

// ---------------------------------------------------------------- already installed?
if (is_file("$target/install.lock") && !is_dir($payload)) {
  layout('Installed', 4, '<div class="card"><h1>EduBooks is installed 🎉</h1><p>If you still see this page, your web server is not passing requests to the app yet. Wait a minute and reload. If it stays, open cPanel → <b>Setup Node.js App</b> and make sure the app is running.</p><p><a class="btn" href="/login">Open EduBooks</a></p></div>');
}

// ---------------------------------------------------------------- update an existing installation
const CODE_PARTS = ['api', 'web', 'node_modules', 'runtime', 'app.js', 'embedded-db.js', 'package.json', 'package-lock.json', 'README.md', 'BUILD_ID'];
if (is_file("$target/install.lock") && is_dir($payload)) {
  if (($_POST['step'] ?? '') === 'update' && hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) {
    try {
      $stamp = date('YmdHis'); $old = "$target/.previous-version-$stamp";
      if (!@mkdir($old, 0700)) throw new RuntimeException("Could not write to $target.");
      foreach (CODE_PARTS as $part) {
        if (!file_exists("$payload/$part")) continue;
        if (file_exists("$target/$part") && !@rename("$target/$part", "$old/$part")) throw new RuntimeException("Could not replace $part.");
        if (!@rename("$payload/$part", "$target/$part")) { @rename("$old/$part", "$target/$part"); throw new RuntimeException("Could not install $part."); }
      }
      make_executable($target);
      @mkdir("$target/tmp", 0755); @touch("$target/tmp/restart.txt"); // tells Passenger to restart the app
      rrmdir($payload); @unlink("$docroot/EDUBOOKS-INSTALL.txt");
      $_SESSION = []; session_destroy();
      @rename(__FILE__, "$target/setup-wizard-used.php");
      register_shutdown_function(function () use ($old) { rrmdir($old); });
    } catch (Throwable $e) {
      layout('Update', 4, '<div class="card"><h1>Update failed</h1>' . list_html([['err', h($e->getMessage())]]) . '<p>Your installed version was not changed.</p></div>');
    }
    layout('Updated', 4, '<div class="card"><h1 id="t">Updating EduBooks…</h1><p id="m">The app restarts and applies database changes. A safety backup of the database is made first.</p><div class="bar" id="bar"><i></i></div><p id="go" hidden><a class="btn" href="/login">Open EduBooks →</a></p></div>
<script>let n=0;async function poll(){n++;try{const r=await fetch("/api/health/ready?"+Date.now(),{cache:"no-store"});if(r.ok){document.getElementById("t").textContent="EduBooks is updated 🎉";document.getElementById("m").textContent="Everything is ready.";document.getElementById("bar").hidden=true;document.getElementById("go").hidden=false;return}}catch(e){}
if(n>90){document.getElementById("m").textContent="Still restarting. If this stays, open cPanel → Setup Node.js App and click Restart.";return}setTimeout(poll,2000)}setTimeout(poll,3000);</script>');
  }
  layout('Update', 4, '<form method="post" class="card">' . hidden() . '<h1>Update EduBooks? 🔄</h1><p>EduBooks is already installed in <code>' . h($target) . '</code>. You uploaded a new version.</p>'
    . list_html([['ok', 'Kept: your database, settings (.env), uploaded books and files, and backups'], ['ok', 'A safety backup of the database is made before the update'], ['ok', 'The app restarts by itself (a few seconds of downtime)']])
    . '<div class="btns"><span></span><button class="btn" name="step" value="update">Update now</button></div></form>');
}

$step = $_POST['step'] ?? $_GET['step'] ?? 'check';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) $step = 'check';
$errors = [];

// ---------------------------------------------------------------- step 1: checks
if ($step === 'check' || $step === 'retest') {
  $rows = checks($docroot, $home, $payload, $target);
  $hardFail = (bool)array_filter($rows, fn($r) => $r[0] === 'err');
  $passengerOk = false;
  if (!$hardFail) {
    if (empty($_SESSION['node']) || $step === 'retest') {
      [$ok, $node, $detail] = passenger_test($docroot, $home, $payload);
      if ($ok) { $_SESSION['node'] = $node; }
      else { unset($_SESSION['node']); }
      $_SESSION['ptest'] = [$ok, $detail];
    }
    [$ok, $detail] = $_SESSION['ptest'];
    $passengerOk = $ok;
    $_SESSION['mode'] = $ok ? 'auto' : 'manual';
    $rows[] = $ok ? ['ok', 'Node.js apps run on this server (' . h($detail) . '). The domain will be connected automatically.']
                  : ['warn', 'The domain cannot be connected automatically on this server, so you will do <b>one extra step</b> in cPanel → <b>Setup Node.js App</b>. The last page shows exactly what to enter. <small>(' . h($detail) . ')</small>'];
  }
  $help = $passengerOk || $hardFail ? '' : '<div class="note">Before you continue, check that cPanel has <b>Setup Node.js App</b> (or <i>Application Manager</i>) under <i>Software</i>. If it is missing, ask your host: <i>"Please enable Node.js applications for my account."</i></div>';
  $can = !$hardFail;
  layout('Server check', 1, '<form method="post" class="card">' . hidden() . '<h1>Welcome! 👋</h1><p>This wizard installs EduBooks LMS on <b>' . h($_SERVER['HTTP_HOST'] ?? '') . '</b>. First, a quick check of your server:</p>' . list_html($rows) . $help
    . '<div class="btns"><button class="btn ghost" name="step" value="retest">Test again</button>' . ($can ? '<button class="btn" name="step" value="admin">Next →</button>' : '') . '</div></form>');
}

// ---------------------------------------------------------------- step 2: super admin
if ($step === 'admin_save') {
  $pub = trim((string)($_POST['publisher'] ?? '')); $u = strtolower(trim((string)($_POST['adminUser'] ?? ''))); $p = (string)($_POST['adminPass'] ?? ''); $p2 = (string)($_POST['adminPass2'] ?? '');
  $demo = !empty($_POST['demo']);
  if (!$demo && $pub === '') $errors[] = 'Enter your publisher (company) name.';
  if (!$demo && !preg_match('/^[a-z0-9._-]{3,40}$/', $u)) $errors[] = 'Username: 3–40 lowercase letters, digits, dot, dash or underscore.';
  if (!$demo && strlen($p) < 10) $errors[] = 'The password needs at least 10 characters.';
  if (!$demo && $p !== $p2) $errors[] = 'The two passwords are not the same.';
  $_SESSION['admin'] = ['publisher' => $pub, 'adminUser' => $u, 'adminPass' => $p, 'demo' => $demo];
  $step = $errors ? 'admin' : 'database';
}
if ($step === 'admin') {
  if (empty($_SESSION['mode'])) { header('Location: ./'); exit; }
  $a = $_SESSION['admin'] ?? ['publisher' => '', 'adminUser' => 'admin', 'demo' => false];
  layout('Super admin', 2, '<form method="post" class="card" autocomplete="off">' . hidden() . '<h1>Super admin account</h1><p>This is <b>your</b> account: it manages books, schools, licences and staff.</p>'
    . ($errors ? list_html(array_map(fn($e) => ['err', h($e)], $errors)) : '')
    . '<label for="publisher">Publisher / company name</label><input id="publisher" name="publisher" value="' . h($a['publisher']) . '" placeholder="Your Publishing House">'
    . '<label for="adminUser">Super admin username</label><input id="adminUser" name="adminUser" value="' . h($a['adminUser'] ?: 'admin') . '" pattern="[a-z0-9._\-]{3,40}" autocapitalize="none">'
    . '<div class="row"><div><label for="adminPass">Password <small>(10+ characters)</small></label><input id="adminPass" name="adminPass" type="password" minlength="10"></div>'
    . '<div><label for="adminPass2">Repeat password</label><input id="adminPass2" name="adminPass2" type="password" minlength="10"></div></div>'
    . '<label class="check"><input type="checkbox" name="demo" value="1"' . (!empty($a['demo']) ? ' checked' : '') . '> <span>Instead, install a <b>demo</b> with sample books, schools and well-known passwords (admin / Admin@12345). <b>Not for real schools.</b></span></label>'
    . '<div class="btns"><a class="btn ghost" href="./">← Back</a><button class="btn" name="step" value="admin_save">Next →</button></div></form>');
}

// ---------------------------------------------------------------- step 3: database
if ($step === 'db_save') {
  $u = strtolower(trim((string)($_POST['dbUser'] ?? ''))); $p = (string)($_POST['dbPass'] ?? ''); $p2 = (string)($_POST['dbPass2'] ?? '');
  if (!preg_match('/^[a-z_][a-z0-9_]{2,40}$/', $u) || in_array($u, ['edubooks', 'edubooks_app', 'postgres'], true)) $errors[] = 'Database username: 3–40 lowercase letters, digits or underscores, starting with a letter (not "edubooks" or "postgres").';
  if (strlen($p) < 10) $errors[] = 'The database password needs at least 10 characters.';
  if ($p !== $p2) $errors[] = 'The two database passwords are not the same.';
  $_SESSION['db'] = ['dbUser' => $u, 'dbPass' => $p];
  $step = $errors ? 'database' : 'review';
}
if ($step === 'database') {
  if (empty($_SESSION['admin'])) { header('Location: ./'); exit; }
  $d = $_SESSION['db'] ?? ['dbUser' => 'eb_admin'];
  layout('Database', 3, '<form method="post" class="card" autocomplete="off">' . hidden() . '<h1>Database login</h1>'
    . '<div class="note">EduBooks brings its <b>own private database</b> (PostgreSQL), so <b>your MySQL is not used</b> and you don\'t need to create anything in cPanel. Choose a new username and password for it. Keep them safe: you only need them for maintenance.</div>'
    . ($errors ? list_html(array_map(fn($e) => ['err', h($e)], $errors)) : '')
    . '<label for="dbUser">Database username</label><input id="dbUser" name="dbUser" value="' . h($d['dbUser']) . '" autocapitalize="none">'
    . '<div class="row"><div><label for="dbPass">Database password <small>(10+ characters)</small></label><input id="dbPass" name="dbPass" type="password" minlength="10"></div>'
    . '<div><label for="dbPass2">Repeat password</label><input id="dbPass2" name="dbPass2" type="password" minlength="10"></div></div>'
    . '<div class="btns"><button class="btn ghost" name="step" value="admin">← Back</button><button class="btn" name="step" value="db_save">Next →</button></div></form>');
}

// ---------------------------------------------------------------- step 4: review + install
if ($step === 'review') {
  if (empty($_SESSION['db']) || empty($_SESSION['admin']) || empty($_SESSION['mode'])) { header('Location: ./'); exit; }
  $a = $_SESSION['admin']; $d = $_SESSION['db'];
  layout('Install', 4, '<form method="post" class="card">' . hidden() . '<h1>Ready to install 🚀</h1>'
    . list_html([
      ['ok', 'Website: <b>' . h(site_url()) . '</b>'],
      ['ok', $a['demo'] ? 'Demo data (sample books and schools)' : 'Publisher: <b>' . h($a['publisher']) . '</b> · super admin: <b>' . h($a['adminUser']) . '</b>'],
      ['ok', 'Built-in database · username <b>' . h($d['dbUser']) . '</b>'],
      ['ok', 'App folder (private, outside public_html): <code>' . h($GLOBALS['target']) . '</code>'],
      $_SESSION['mode'] === 'auto' ? ['ok', 'The domain is connected to the app automatically'] : ['warn', 'After you click Install, one step in cPanel → Setup Node.js App (shown on the next page)'],
    ])
    . (is_https() ? '' : '<div class="note">⚠️ You opened this page with <b>http://</b>. For a real site, enable <b>AutoSSL</b> in cPanel → SSL/TLS Status and reopen with <b>https://</b> before installing, so sign-ins are encrypted.</div>')
    . '<div class="btns"><button class="btn ghost" name="step" value="database">← Back</button><button class="btn" name="step" value="install">Install now</button></div></form>');
}

if ($step === 'install') {
  if (empty($_SESSION['db']) || empty($_SESSION['admin']) || empty($_SESSION['mode'])) { header('Location: ./'); exit; }
  $a = $_SESSION['admin']; $d = $_SESSION['db']; $node = (string)($_SESSION['node'] ?? ''); $manual = $_SESSION['mode'] !== 'auto';
  try {
    if (!is_dir($payload)) throw new RuntimeException('The folder "' . APP_DIR_NAME . '" is missing. Extract the zip again.');
    // 1. Move the app out of public_html.
    if (is_dir($target)) {
      if (is_file("$target/install.lock")) throw new RuntimeException("EduBooks is already installed in $target.");
      if (!@rename($target, $target . '-old-' . date('YmdHis'))) throw new RuntimeException("Could not rename the old folder $target.");
    }
    if (!@rename($payload, $target)) throw new RuntimeException("Could not move the app to $target.");
    make_executable($target);
    if ($node !== '' && strpos($node, $payload . '/') === 0) $node = $target . substr($node, strlen($payload));
    @unlink("$target/.htaccess"); // only protected the folder while it was inside public_html
    // 2. Answers for the app's automatic installer (deleted by the app as soon as it reads them).
    $answers = ['siteUrl' => site_url(), 'publisher' => $a['publisher'], 'adminUser' => $a['adminUser'] ?: 'admin', 'adminPass' => $a['adminPass'],
      'demo' => $a['demo'] ? '1' : '', 'dbUser' => $d['dbUser'], 'dbPass' => $d['dbPass'], 'ai' => 'offline'];
    if (file_put_contents("$target/autoinstall.json", json_encode($answers)) === false) throw new RuntimeException('Could not write the settings file.');
    @chmod("$target/autoinstall.json", 0600);
    // 3. Point the domain at the app (keeps a copy of any previous .htaccess). In manual mode cPanel does this.
    $ht = "$docroot/.htaccess";
    if (!$manual) {
    $old = is_file($ht) ? (string)file_get_contents($ht) : '';
    if ($old !== '' && strpos($old, MARK_BEGIN) === false) @copy($ht, "$docroot/.htaccess.before-edubooks");
    $old = preg_replace('/' . preg_quote(MARK_BEGIN, '/') . '.*?' . preg_quote(MARK_END, '/') . '\n?/s', '', $old);
    if (file_put_contents($ht, passenger_block($target, $node, '/') . $old) === false) throw new RuntimeException('Could not write .htaccess in this folder.');
    }
    // 4. Remove the wizard from public_html.
    @unlink("$docroot/EDUBOOKS-INSTALL.txt");
    @rename(__FILE__, "$target/setup-wizard-used.php");
    $_SESSION = []; session_destroy();
  } catch (Throwable $e) {
    layout('Install', 4, '<div class="card"><h1>Something went wrong</h1>' . list_html([['err', h($e->getMessage())]]) . '<p><a class="btn" href="./">Start again</a></p></div>');
  }
  $host = h(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
  $manualBox = !$manual ? '' : '<div class="note" id="manual"><b>Last step — connect your domain in cPanel</b> (keep this page open):<ol style="margin:8px 0 0;padding-left:20px;line-height:1.9">'
    . '<li>Open cPanel → <b>Setup Node.js App</b> (or <i>Application Manager</i>) → <b>Create Application</b></li>'
    . '<li>Node.js version: <b>20 or newer</b> · Application mode: <b>Production</b></li>'
    . '<li>Application root: <code>' . h(APP_DIR_NAME) . '</code></li>'
    . '<li>Application URL: <code>' . $host . '</code> (leave the path empty)</li>'
    . '<li>Application startup file: <code>app.js</code></li>'
    . '<li>Click <b>Create</b>. <b>Do not</b> click “Run NPM Install”: everything is already included.</li></ol>'
    . '<p style="margin:8px 0 0">This page continues by itself as soon as the app starts.</p></div>';
  layout('Installing', 4, '<div class="card"><h1 id="t">' . ($manual ? 'Almost done!' : 'Installing EduBooks…') . '</h1>' . $manualBox . '<p id="m">' . ($manual ? 'Waiting for the app to start…' : 'Starting the app. This takes about a minute — please keep this page open.') . '</p><div class="bar" id="bar"><i></i></div><ul class="res" id="steps"></ul><p id="go" hidden><a class="btn" href="/login">Open EduBooks →</a></p></div>
<script>
const $=(id)=>document.getElementById(id);let tries=0;
async function poll(){tries++;
 try{const r=await fetch("/install-status?"+Date.now(),{cache:"no-store"});
  if(r.ok&&(r.headers.get("content-type")||"").includes("json")){const s=await r.json();
   if(s.message)$("m").textContent=s.message;
   if(s.steps)$("steps").innerHTML=s.steps.map(x=>"<li class=ok>✅ "+x.replace(/[<>&]/g,"")+"</li>").join("");
   if($("manual"))$("manual").hidden=true;
   if(s.state==="done"){$("t").textContent="EduBooks is ready! 🎉";$("m").textContent="Sign in with the super admin account you just created (choose Publisher staff).";$("bar").hidden=true;$("go").hidden=false;return}
   if(s.state==="error"){$("t").textContent="Installation stopped";$("m").innerHTML="";$("bar").hidden=true;$("steps").innerHTML="<li class=err>❌ "+(s.message||"").replace(/[<>&]/g,"")+"</li><li class=warn>Fix the problem, then open your website: the installer form will let you try again (its key is in edubooks-app/install-key.txt).</li>";return}
  }}catch(e){}
 if(tries>150&&!document.getElementById("manual")){$("m").textContent="This is taking longer than expected. Reload this page in a minute, or check edubooks-app/stderr.log.";return}
 setTimeout(poll,2000)}
setTimeout(poll,1500);
</script>');
}

header('Location: ./');
