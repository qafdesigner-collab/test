@php
    $arabic = app()->getLocale() === 'ar';
    try {
        $brand = \Illuminate\Support\Facades\DB::table('settings')->whereIn('key', ['logo_path', 'company_name', 'brand_color'])->pluck('value', 'key');
    } catch (\Throwable) {
        $brand = collect();
    }
@endphp
<!doctype html>
<html lang="{{ $arabic ? 'ar' : 'en' }}" dir="{{ $arabic ? 'rtl' : 'ltr' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>{{ __('Sign in') }} · Atelier ERP</title>
    <script>try{document.documentElement.dataset.theme=localStorage.getItem('atelier-theme')||'light'}catch(e){document.documentElement.dataset.theme='light'}</script>
    <link rel="stylesheet" href="/assets/app.css?v={{ config('erp.version') }}">
    @if (preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($brand['brand_color'] ?? '')))<style>:root{--accent:{{ $brand['brand_color'] }}}</style>@endif
</head>
<body class="login-body">
    <main class="login-card">
        <a class="language-link" href="#" onclick="var l='{{ $arabic ? 'en' : 'ar' }}';try{localStorage.setItem('atelier-lang',l)}catch(e){}document.cookie='atelier_lang='+l+'; path=/; max-age=31536000; SameSite=Lax';location.reload();return false;">{{ $arabic ? 'English' : 'العربية' }}</a>
        @if (! empty($brand['logo_path']))
            <img class="brand-logo login-logo" src="/media/logo" alt="{{ $brand['company_name'] ?? '' }}">
        @else
            <div class="brand-mark">A</div>
        @endif
        <p class="eyebrow">{{ $brand['company_name'] ?? __('Perfume business workspace') }}</p>
        <h1>{!! nl2br(e(__("A little more\norder. A lot more\npossibility."))) !!}</h1>
        <p class="muted">{{ __('Manufacture, create and sell. One connected workspace.') }}</p>
        @if (session('status'))<div class="notice">{{ session('status') }}</div>@endif
        <form method="post" action="/login">
            @csrf
            <label>{{ __('Email address') }}<input name="email" type="email" autocomplete="username" value="{{ old('email') }}" required autofocus></label>
            <label>{{ __('Password') }}<input name="password" type="password" autocomplete="current-password" required></label>
            @if ($errors->any())<div class="error">{{ $errors->first() }}</div>@endif
            <button class="primary full" type="submit">{{ __('Sign in to your workspace') }} <span>{{ $arabic ? '←' : '→' }}</span></button>
        </form>
        <p class="tiny muted">{{ __("Your company's private installation") }} · {{ __('Version') }} {{ config('erp.version') }}</p>
    </main>
    <aside class="login-art">
        <div class="orb"></div>
        <div class="big-bottle"><div class="cap"></div><div class="bottle"><span>ATELIER</span><small>EAU DE PARFUM</small></div></div>
        <p>{!! nl2br(e(__("CRAFTED WITH CARE.\nMANAGED WITH CLARITY."))) !!}</p>
    </aside>
</body>
</html>
