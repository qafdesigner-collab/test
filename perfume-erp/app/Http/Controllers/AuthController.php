<?php

namespace App\Http\Controllers;

use App\Services\TwoFactor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Sign in, sign out and password changes.
 */
class AuthController extends ErpBaseController
{
    public function login(Request $r)
    {
        $v = $r->validate(['email' => 'required|email', 'password' => 'required|string']);
        $key = 'login:'.$r->ip().':'.strtolower($v['email']);
        if (RateLimiter::tooManyAttempts($key, 6)) {
            throw ValidationException::withMessages(['email' => __('Too many attempts. Try again in a minute.')]);
        }
        if (! Auth::validate($v + ['active' => true])) {
            RateLimiter::hit($key, 60);
            throw ValidationException::withMessages(['email' => __('Email or password is incorrect.')]);
        }
        RateLimiter::clear($key);
        $user = Auth::getLastAttempted();
        $r->session()->regenerate();
        if (TwoFactor::enabled($user)) {
            $r->session()->put('two_factor', ['user' => $user->id, 'at' => now()->getTimestamp()]);

            return redirect('/login/two-factor');
        }
        Auth::login($user);
        $this->audit('auth.login', 'user:'.Auth::id());

        return redirect('/');
    }

    public function logout(Request $r)
    {
        Auth::logout();
        $r->session()->invalidate();
        $r->session()->regenerateToken();

        return redirect('/login');
    }

    public function password(Request $r)
    {
        $v = $r->validate(['current_password' => 'required|current_password', 'password' => 'required|string|min:12|max:128|confirmed']);
        Auth::user()->forceFill(['password' => Hash::make($v['password'])])->save();
        $r->session()->regenerate();
        $this->audit('user.password', 'user:'.Auth::id());

        return ['ok' => true];
    }
}
