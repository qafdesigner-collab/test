<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install · Atelier ERP</title>
<link rel="stylesheet" href="/assets/app.css">
<style>
    .install-body{min-height:100vh;background:linear-gradient(160deg,#f4f7f4,#ece8df);padding:32px 16px;box-sizing:border-box}
    .install-card{max-width:860px;margin:0 auto;background:#fffdf9;border:1px solid #e3e6df;border-radius:22px;box-shadow:0 20px 60px #1d3b2f14;padding:36px}
    .install-card h1{font-size:30px;margin:10px 0 6px}
    .install-card h2{font-size:17px;margin:30px 0 12px;padding-top:22px;border-top:1px solid #e9ece6}
    .install-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px}
    .install-grid .span2{grid-column:1/-1}
    .install-card label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:#486155}
    .checks{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;font-size:13px}
    .checks li{display:flex;gap:8px;align-items:flex-start}
    .checks .ok{color:#087b61}.checks .bad{color:#b4232c;font-weight:600}
    .checks small{display:block;color:#7a5a3a;font-weight:400}
    .code-hint{background:#f1f6f2;border:1px solid #d6e3dc;border-radius:12px;padding:12px 14px;font-size:13px;color:#264b3d;line-height:1.55}
    .code-hint code{background:#fff;border:1px solid #d6e3dc;border-radius:6px;padding:1px 6px}
    .db-mysql[hidden]{display:none}
    .install-actions{margin-top:26px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
    .install-errors{background:#fdf0ef;border:1px solid #f0c9c5;color:#8c1d24;border-radius:12px;padding:12px 16px;margin:18px 0;font-size:14px}
    .install-errors ul{margin:6px 0 0;padding-left:18px}
    .check-row{flex-direction:row!important;align-items:center;justify-content:flex-start;gap:10px!important}
    @media (max-width:640px){.install-card{padding:22px}.install-grid,.checks{grid-template-columns:1fr}}
</style>
</head>
<body class="install-body">
<main class="install-card">
    <div class="brand-mark">A</div>
    <p class="eyebrow">ATELIER PERFUME ERP · INSTALLATION</p>
    <h1>Set up your company workspace</h1>
    <p class="muted">This page appears only once. After installation it closes automatically and the sign-in page opens.</p>

    @if ($errors->any())
        <div class="install-errors" role="alert"><b>Please check the following:</b><ul>@foreach ($errors->all() as $error)<li>{{ $error }}</li>@endforeach</ul></div>
    @endif

    <h2>1 · Server check</h2>
    <ul class="checks">
        @foreach ($checks as $check)
            <li class="{{ $check['ok'] ? 'ok' : 'bad' }}"><span>{{ $check['ok'] ? '✓' : '✗' }}</span><span>{{ $check['label'] }}@unless ($check['ok'])<small>{{ $check['hint'] }}</small>@endunless</span></li>
        @endforeach
    </ul>

    <form method="post" action="/install" autocomplete="off">
        @csrf
        <h2>2 · Install code</h2>
        <div class="code-hint">To prove you own this server, open <b>cPanel → File Manager</b>, go to the application folder and open <code>storage/app/private/install-code.txt</code>. Type the 8-character code below.</div>
        <div class="install-grid" style="margin-top:14px">
            <label>Install code<input name="install_code" value="{{ old('install_code') }}" required maxlength="20" autocapitalize="characters"></label>
            <label>Website address<input name="app_url" type="url" value="{{ old('app_url', $url) }}" required></label>
        </div>

        <h2>3 · Database</h2>
        <div class="install-grid">
            <label class="span2">Database type
                <select name="db_connection" id="db-connection">
                    <option value="mysql" @selected(old('db_connection', 'mysql') === 'mysql')>MySQL / MariaDB (recommended on cPanel)</option>
                    <option value="sqlite" @selected(old('db_connection') === 'sqlite')>SQLite file (single office computer)</option>
                </select>
            </label>
            <label class="db-mysql">Database host<input name="db_host" value="{{ old('db_host', 'localhost') }}"></label>
            <label class="db-mysql">Port<input name="db_port" inputmode="numeric" value="{{ old('db_port', '3306') }}"></label>
            <label class="db-mysql">Database name<input name="db_database" value="{{ old('db_database') }}" placeholder="cpaneluser_erp"></label>
            <label class="db-mysql">Database user<input name="db_username" value="{{ old('db_username') }}" placeholder="cpaneluser_erpuser"></label>
            <label class="db-mysql span2">Database password<input name="db_password" type="password"></label>
            <p class="form-hint db-mysql span2">Create these in <b>cPanel → MySQL Databases</b>: a new database, a new user, then “Add user to database” with ALL PRIVILEGES.</p>
        </div>

        <h2>4 · Company and owner account</h2>
        <div class="install-grid">
            <label>Company name<input name="company_name" value="{{ old('company_name') }}" required maxlength="150"></label>
            <label>Currency code<input name="currency" value="{{ old('currency', 'AED') }}" required maxlength="3"></label>
            <label>Your name<input name="name" value="{{ old('name') }}" required maxlength="100"></label>
            <label>Email<input name="email" type="email" value="{{ old('email') }}" required maxlength="150"></label>
            <label>Password (minimum 12 characters)<input name="password" type="password" required minlength="12" autocomplete="new-password"></label>
            <label>Repeat password<input name="password_confirmation" type="password" required minlength="12" autocomplete="new-password"></label>
            <label class="span2 check-row"><input type="checkbox" name="demo" value="1" style="width:auto;margin:0" @checked(old('demo'))> Add fictional demo products so I can try the system first</label>
        </div>

        <div class="install-actions">
            <button class="primary" type="submit">Install Atelier ERP →</button>
            <span class="tiny muted">Version {{ config('erp.version') }} · 166 inspiration references are added automatically.</span>
        </div>
    </form>
</main>
<script>
    const dbSelect = document.getElementById('db-connection');
    const toggleDatabaseFields = () => document.querySelectorAll('.db-mysql').forEach(el => el.hidden = dbSelect.value !== 'mysql');
    dbSelect.addEventListener('change', toggleDatabaseFields);
    toggleDatabaseFields();
</script>
</body>
</html>
