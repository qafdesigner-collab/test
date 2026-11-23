<?php

namespace App\Http\Middleware;

use App\Services\Installation;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RedirectToInstaller
{
    /**
     * Send every request to the web installer until the owner account exists.
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('erp.install_check') || $request->is('install') || Installation::isInstalled()) {
            return $next($request);
        }

        return $request->expectsJson()
            ? response()->json(['message' => 'This installation has not been set up yet.'], 503)
            : redirect('/install');
    }
}
