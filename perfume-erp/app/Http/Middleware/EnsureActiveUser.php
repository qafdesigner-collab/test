<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsureActiveUser
{
    public function handle(Request $request, Closure $next)
    {
        abort_unless($request->user()?->active, 403, __('Your account is disabled.'));

        return $next($request);
    }
}
