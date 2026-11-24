<?php

namespace App\Http\Controllers;

use App\Services\Documents;
use App\Services\TwoFactor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Two-step sign-in for owners and managers: set up with an authenticator app, recovery codes, switch off, and the sign-in challenge.
 */
class TwoFactorController extends ErpBaseController
{
    private const CHALLENGE_MINUTES = 5;

    public function status()
    {
        $user = DB::table('users')->where('id', Auth::id())->first();

        return ['available' => in_array($user->role, TwoFactor::ROLES, true), 'enabled' => TwoFactor::enabled($user), 'recovery_remaining' => TwoFactor::enabled($user) ? TwoFactor::recoveryRemaining($user) : 0];
    }

    public function action(Request $r)
    {
        $this->allow(['manager']);
        $v = $r->validate(['action' => 'required|in:setup,confirm,disable,recovery', 'password' => 'required_unless:action,confirm|nullable|current_password', 'code' => 'required_if:action,confirm|nullable|string|max:10']);
        $id = Auth::id();
        $user = DB::table('users')->where('id', $id)->first();
        $enabled = TwoFactor::enabled($user);

        return match ($v['action']) {
            'setup' => $this->setup($user, $enabled),
            'confirm' => $this->confirm($user, $enabled, $v['code']),
            'disable' => $this->disable($user, $enabled),
            'recovery' => $this->newRecoveryCodes($user, $enabled),
        };
    }

    private function setup(object $user, bool $enabled): array
    {
        if ($enabled) {
            Documents::fail(__('Two-step sign-in is already switched on.'));
        }
        $secret = TwoFactor::generateSecret();
        DB::table('users')->where('id', $user->id)->update(['two_factor_secret' => Crypt::encryptString($secret), 'two_factor_confirmed_at' => null, 'two_factor_recovery_codes' => null, 'two_factor_last_step' => null, 'updated_at' => now()]);
        $issuer = DB::table('settings')->where('key', 'company_name')->value('value') ?: 'Atelier ERP';

        return ['secret' => $secret, 'uri' => TwoFactor::uri($secret, $user->email, $issuer)];
    }

    private function confirm(object $user, bool $enabled, string $code): array
    {
        $key = 'two-factor-confirm:'.$user->id;
        if (RateLimiter::tooManyAttempts($key, 6)) {
            Documents::fail(__('Too many attempts. Try again in a minute.'));
        }
        $secret = TwoFactor::secretFor($user);
        if ($enabled || ! $secret) {
            Documents::fail(__('Start the set-up again.'));
        }
        $step = TwoFactor::matchStep($secret, $code);
        if ($step === null) {
            RateLimiter::hit($key, 60);
            throw ValidationException::withMessages(['code' => __('The code is not correct. Check the time on your phone and try again.')]);
        }
        RateLimiter::clear($key);
        $codes = TwoFactor::recoveryCodes();
        DB::table('users')->where('id', $user->id)->update(['two_factor_confirmed_at' => now(), 'two_factor_last_step' => $step, 'two_factor_recovery_codes' => $codes['stored'], 'updated_at' => now()]);
        $this->audit('user.two_factor_on', 'user:'.$user->id);

        return ['recovery_codes' => $codes['plain']];
    }

    private function disable(object $user, bool $enabled): array
    {
        $this->clear($user->id);
        if ($enabled) {
            $this->audit('user.two_factor_off', 'user:'.$user->id);
        }

        return ['ok' => true];
    }

    private function newRecoveryCodes(object $user, bool $enabled): array
    {
        if (! $enabled) {
            Documents::fail(__('Switch on two-step sign-in first.'));
        }
        $codes = TwoFactor::recoveryCodes();
        DB::table('users')->where('id', $user->id)->update(['two_factor_recovery_codes' => $codes['stored'], 'updated_at' => now()]);
        $this->audit('user.two_factor_recovery', 'user:'.$user->id);

        return ['recovery_codes' => $codes['plain']];
    }

    /**
     * The owner switches off two-step sign-in for someone who lost their phone and recovery codes.
     */
    public function reset(int $id)
    {
        $this->allow([]);
        abort_unless(DB::table('users')->where('id', $id)->exists(), 404);
        $this->clear($id);
        $this->audit('user.two_factor_reset', 'user:'.$id);

        return ['ok' => true];
    }

    public function challenge(Request $r)
    {
        if (! $this->pendingUser($r)) {
            return redirect('/login');
        }

        return view('login', ['challenge' => true]);
    }

    public function verify(Request $r)
    {
        $id = $this->pendingUser($r);
        if (! $id) {
            return redirect('/login')->with('status', __('Your sign-in expired. Please sign in again.'));
        }
        $v = $r->validate(['code' => 'required|string|max:20']);
        $key = 'two-factor:'.$id;
        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages(['code' => __('Too many attempts. Try again in a minute.')]);
        }
        if (! TwoFactor::verify($id, $v['code'])) {
            RateLimiter::hit($key, 60);
            throw ValidationException::withMessages(['code' => __('The code is not correct.')]);
        }
        RateLimiter::clear($key);
        $r->session()->forget('two_factor');
        Auth::loginUsingId($id);
        $r->session()->regenerate();
        $this->audit('auth.login', 'user:'.$id, ['two_step' => true]);

        return redirect('/');
    }

    private function pendingUser(Request $r): ?int
    {
        $pending = $r->session()->get('two_factor');
        if (! $pending || $pending['at'] < now()->subMinutes(self::CHALLENGE_MINUTES)->getTimestamp()) {
            return null;
        }
        $active = DB::table('users')->where('id', $pending['user'])->where('active', true)->exists();

        return $active ? (int) $pending['user'] : null;
    }

    private function clear(int $id): void
    {
        DB::table('users')->where('id', $id)->update(['two_factor_secret' => null, 'two_factor_recovery_codes' => null, 'two_factor_confirmed_at' => null, 'two_factor_last_step' => null, 'updated_at' => now()]);
    }
}
