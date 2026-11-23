<?php

namespace App\Http\Controllers;

use App\Services\Documents;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Shared permission, audit and duplicate-request helpers for the ERP API controllers.
 */
abstract class ErpBaseController extends Controller
{
    const ROLES = ['owner', 'manager', 'warehouse', 'production', 'cashier', 'designer', 'accountant'];

    protected function allow(array $roles): void
    {
        abort_unless(Auth::check() && Auth::user()->active && in_array(Auth::user()->role, array_merge(['owner'], $roles)), 403, __('You do not have permission for this action.'));
    }

    protected function audit(string $action, string $subject, array $details = []): void
    {
        DB::table('audit')->insert(['user_id' => Auth::id(), 'action' => $action, 'subject' => $subject, 'details' => json_encode($details), 'created_at' => now()]);
    }

    protected function once(Request $r, string $action, callable $fn): array
    {
        $key = $r->header('Idempotency-Key');
        if (! $key || ! Str::isUuid($key)) {
            Documents::fail(__('A unique request identifier is required.'));
        }$fingerprint = hash('sha256', json_encode($r->except('_token')));

        return DB::transaction(function () use ($key, $action, $fingerprint, $fn) {
            $prior = DB::table('idempotency')->where('key', $key)->first();
            if ($prior) {
                abort_unless($prior->user_id === Auth::id() && $prior->action === $action && $prior->fingerprint === $fingerprint, 409, __('Request identifier was already used.'));

                return json_decode($prior->result, true);
            }$result = $fn();
            DB::table('idempotency')->insert(['key' => $key, 'user_id' => Auth::id(), 'action' => $action, 'fingerprint' => $fingerprint, 'result' => json_encode($result), 'created_at' => now()]);

            return $result;
        }, 3);
    }
}
