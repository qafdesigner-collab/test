<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('system', fn (Request $request) => Limit::perMinute(5)->by('system:'.($request->user()?->id ?: $request->ip())));
        RateLimiter::for('update-package', fn (Request $request) => Limit::perMinute(400)->by('update-package:'.($request->user()?->id ?: $request->ip())));
        RateLimiter::for('two-factor', fn (Request $request) => Limit::perMinute(20)->by('two-factor:'.($request->user()?->id ?: $request->ip())));
    }
}
