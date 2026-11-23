<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Atelier · Perfume ERP</title>
    <script>try{document.documentElement.dataset.theme=localStorage.getItem('atelier-theme')||'light';var l=localStorage.getItem('atelier-lang');if(l==='ar'){document.documentElement.lang=l;document.documentElement.dir='rtl'}}catch(e){document.documentElement.dataset.theme='light'}</script>
    <link rel="stylesheet" href="/assets/app.css?v={{ config('erp.version') }}">
    {{-- Modules share one global scope and load in this order; main.js starts the app. --}}
    @foreach (['core', 'shell', 'dashboard', 'catalogue', 'inventory', 'sales', 'pos', 'manufacturing', 'projects', 'customers', 'reports', 'expenses', 'profit', 'settings', 'tables', 'i18n-dict', 'i18n', 'main'] as $module)
        <script src="/assets/js/{{ $module }}.js?v={{ config('erp.version') }}" defer></script>
    @endforeach
</head>
<body>
    <aside id="sidebar" class="sidebar">
        <a href="#dashboard" class="brand">
            <span class="brand-mark">A</span>
            <span>atelier<small>PERFUME BUSINESS ERP</small></span>
        </a>
        <div class="workspace-label">YOUR WORKSPACE</div>
        <nav id="navigation"></nav>
        <div class="sidebar-bottom">
            <div class="connection"><i></i><span>Connected to this server</span></div>
            <button type="button" class="theme-toggle" onclick="cycleTheme()" aria-label="Change colour theme"><span aria-hidden="true">◐</span> Theme: <b id="theme-name">Light</b></button>
            <button type="button" class="theme-toggle" onclick="cycleLanguage()" aria-label="Change language"><span aria-hidden="true">文</span> <span>Language:</span> <b data-no-translate id="language-name">English</b></button>
            <div class="build-badge">Development release · {{ \Illuminate\Support\Str::before(config('erp.version'), '-') }}</div>
            <button class="user-card" onclick="passwordDialog()">
                <span class="avatar" id="avatar">A</span>
                <span><b id="user-name"></b><small id="user-role"></small></span>
                <span>⚙</span>
            </button>
            <form action="/logout" method="post">
                @csrf
                <button type="submit" class="logout">Sign out →</button>
            </form>
        </div>
    </aside>

    <div class="app-main">
        <header class="topbar">
            <button class="icon-button mobile-menu" aria-label="Open navigation" onclick="document.body.classList.toggle('nav-open')">☰</button>
            <div class="topbar-title" id="company-name">Your company</div>
            <div class="topbar-right">
                <span class="server-chip">Private installation</span>
                <select id="location-picker" aria-label="Working location"></select>
                <button class="icon-button" aria-label="Refresh page" onclick="render()">↻</button>
            </div>
        </header>
        <main id="content">
            <div class="loading"><span class="spinner"></span>Opening your workspace…</div>
        </main>
        <footer>
            Atelier ERP · <span id="footer-company"></span>
            <span class="footer-right">Online server or local LAN · Hybrid syncing not enabled</span>
        </footer>
    </div>

    <div id="modal-root"></div>
    <div id="toast" role="status" aria-live="polite"></div>
</body>
</html>
