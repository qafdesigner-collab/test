<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class SetLocale
{
    /**
     * Answer in Arabic when the browser asks for it (X-Locale header from the app, or the language cookie).
     */
    public function handle(Request $request, Closure $next): Response
    {
        $locale = $request->header('X-Locale') ?: $request->cookie('atelier_lang');
        App::setLocale($locale === 'ar' ? 'ar' : 'en');

        return $next($request);
    }
}
