<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use App\Services\Documents;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Cashier shifts for the point of sale.
 */
class ShiftController extends ErpBaseController
{
    public function shifts(Request $r)
    {
        $this->allow(['manager', 'cashier']);
        if ($r->isMethod('post')) {
            $v = $r->validate(['action' => ['required', Rule::in(['open', 'close'])], 'amount' => 'required']);
            $amount = Amounts::parse($v['amount']);

            return $this->once($r, 'shift', function () use ($v, $amount) {
                $shift = DB::table('shifts')->where('user_id', Auth::id())->whereNull('closed_at')->lockForUpdate()->first();
                if ($v['action'] === 'open') {
                    if ($shift) {
                        Documents::fail(__('You already have an open shift.'));
                    }$id = DB::table('shifts')->insertGetId(['user_id' => Auth::id(), 'opening_cents' => $amount, 'opened_at' => now()]);

                    return ['id' => $id];
                }if (! $shift) {
                    Documents::fail(__('No open shift.'));
                }$cash = $this->shiftCash($shift);
                DB::table('shifts')->where('id', $shift->id)->update(['counted_cents' => $amount, 'variance_cents' => $amount - ($shift->opening_cents + $cash), 'closed_at' => now()]);

                return ['id' => $shift->id, 'variance_cents' => $amount - ($shift->opening_cents + $cash)];
            });
        }$rows = DB::table('shifts')->where('user_id', Auth::id())->orderByDesc('id')->limit(20)->get();
        foreach ($rows as $s) {
            $s->expected_cents = $s->opening_cents + $this->shiftCash($s);
        }

        return ['shifts' => $rows];
    }

    private function shiftCash(object $s): int
    {
        $end = $s->closed_at ?? now();
        $received = DB::table('payments')->where('user_id', $s->user_id)->where('method', 'Cash')->whereBetween('created_at', [$s->opened_at, $end])->whereIn('document_id', DB::table('documents')->whereIn('kind', ['Sale', 'Invoice'])->select('id'))->sum('amount_cents');
        $refunds = DB::table('documents')->where('user_id', $s->user_id)->where('kind', 'Return')->whereBetween('created_at', [$s->opened_at, $end])
            ->selectRaw("COALESCE(SUM(CASE WHEN cash_refund_cents IS NOT NULL THEN cash_refund_cents WHEN method = 'Cash' THEN paid_cents ELSE 0 END),0) as cash")->value('cash');

        $expenses = DB::table('expenses')->where('user_id', $s->user_id)->where('from_drawer', true)->whereNull('voided_at')->whereBetween('created_at', [$s->opened_at, $end])->sum('amount_cents');

        return (int) $received - (int) $refunds - (int) $expenses;
    }
}
