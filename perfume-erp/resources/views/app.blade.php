<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Atelier · Perfume ERP</title>
    <script>try{document.documentElement.dataset.theme=localStorage.getItem('atelier-theme')||'obsidian';var l=localStorage.getItem('atelier-lang');if(l==='ar'){document.documentElement.lang=l;document.documentElement.dir='rtl'}}catch(e){document.documentElement.dataset.theme='obsidian'}</script>
    <link rel="stylesheet" href="/assets/app.css?v={{ config('erp.version') }}">
    <link rel="stylesheet" href="/assets/themes.css?v={{ config('erp.version') }}">
    {{-- Modules share one global scope and load in this order; main.js starts the app. --}}
    @foreach (['core', 'barcodes', 'shell', 'dashboard', 'catalogue', 'inventory', 'sales', 'pos', 'manufacturing', 'projects', 'customers', 'reports', 'expenses', 'profit', 'settings', 'tables', 'i18n-dict', 'i18n', 'main'] as $module)
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
            <button class="user-card" onclick="passwordDialog()">
                <span class="avatar" id="avatar">A</span>
                <span><b id="user-name"></b><small id="user-role"></small></span>
                <span class="user-card-gear" aria-hidden="true">⚙</span>
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
                <select id="location-picker" aria-label="Working location"></select>
                <button type="button" class="top-pill" onclick="themeDialog()" aria-label="Change colour theme"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/></svg><span id="theme-name">Obsidian</span></button>
                <button type="button" class="top-pill" onclick="cycleLanguage()" aria-label="Change language"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5s1.2-6.2 3.6-8.5z"/></svg><b data-no-translate id="language-name">English</b></button>
                <button class="icon-button" aria-label="Refresh page" onclick="render()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/></svg></button>
            </div>
        </header>
        <main id="content">
            <div class="loading"><span class="spinner"></span>Opening your workspace…</div>
        </main>
        <footer>
            <span id="footer-company"></span>
            <span class="footer-right">Atelier ERP · {{ config('erp.version') }}</span>
        </footer>
    </div>

    <div id="modal-root"></div>
    <div id="toast" role="status" aria-live="polite"></div>
</body>
</html>
