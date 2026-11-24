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
        }$everyone = $r->boolean('all') && in_array(Auth::user()->role, ['owner', 'manager']);
        $rows = DB::table('shifts as s')->join('users as u', 'u.id', '=', 's.user_id')->when(! $everyone, fn ($q) => $q->where('s.user_id', Auth::id()))
            ->select('s.*', 'u.name as cashier')->orderByDesc('s.id')->limit($everyone ? 60 : 20)->get();
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

    /**
     * End-of-day (Z) report for one shift: sales, VAT, payments by method, refunds, drawer expenses and cash.
     */
    public function report(int $id)
    {
        $this->allow(['manager', 'cashier']);
        $s = DB::table('shifts as s')->join('users as u', 'u.id', '=', 's.user_id')->where('s.id', $id)->select('s.*', 'u.name as cashier')->first();
        abort_unless($s, 404);
        if (Auth::user()->role === 'cashier') {
            abort_unless($s->user_id === Auth::id(), 403);
        }
        $end = $s->closed_at ?? now();
        $sales = DB::table('documents')->where('user_id', $s->user_id)->whereIn('kind', ['Sale', 'Invoice'])->whereIn('status', ['Posted', 'Returned'])->whereBetween('created_at', [$s->opened_at, $end]);
        $returns = DB::table('documents')->where('user_id', $s->user_id)->where('kind', 'Return')->whereBetween('created_at', [$s->opened_at, $end]);
        $payments = DB::table('payments as p')->join('documents as d', 'd.id', '=', 'p.document_id')->where('p.user_id', $s->user_id)->whereIn('d.kind', ['Sale', 'Invoice'])
            ->whereBetween('p.created_at', [$s->opened_at, $end])->groupBy('p.method')->selectRaw('p.method, COUNT(*) as count, SUM(p.amount_cents) as amount')->get();
        $refunds = (clone $returns)->get(['method', 'paid_cents', 'cash_refund_cents']);
        $expenses = DB::table('expenses')->where('user_id', $s->user_id)->where('from_drawer', true)->whereNull('voided_at')->whereBetween('created_at', [$s->opened_at, $end])->get(['number', 'category', 'description', 'amount_cents']);
        $items = DB::table('document_lines as l')->join('documents as d', 'd.id', '=', 'l.document_id')->where('d.user_id', $s->user_id)->whereIn('d.kind', ['Sale', 'Invoice'])
            ->whereIn('d.status', ['Posted', 'Returned'])->whereBetween('d.created_at', [$s->opened_at, $end])
            ->groupBy('l.product_id', 'l.name', 'l.unit')->select('l.name', 'l.unit')->selectRaw('SUM(l.quantity_milli) as quantity_milli, SUM(l.total_cents) as total_cents')->orderByDesc('total_cents')->limit(10)->get();
        $cash = $this->shiftCash($s);

        return [
            'shift' => $s,
            'sales' => ['count' => (clone $sales)->count(), 'net_cents' => (int) (clone $sales)->sum('subtotal_cents'), 'vat_cents' => (int) (clone $sales)->sum('tax_cents'), 'total_cents' => (int) (clone $sales)->sum('total_cents'), 'discount_cents' => (int) DB::table('document_lines')->whereIn('document_id', (clone $sales)->select('id'))->sum('discount_cents')],
            'payments' => $payments->map(fn ($p) => ['method' => $p->method, 'count' => (int) $p->count, 'amount_cents' => (int) $p->amount])->values(),
            'returns' => ['count' => $refunds->count(), 'refund_cents' => (int) $refunds->sum('paid_cents'), 'cash_refund_cents' => (int) $refunds->sum(fn ($r) => $r->cash_refund_cents ?? ($r->method === 'Cash' ? $r->paid_cents : 0))],
            'expenses' => $expenses,
            'cash' => ['opening_cents' => (int) $s->opening_cents, 'movement_cents' => $cash, 'expected_cents' => (int) $s->opening_cents + $cash, 'counted_cents' => $s->counted_cents === null ? null : (int) $s->counted_cents, 'variance_cents' => $s->variance_cents === null ? null : (int) $s->variance_cents],
            'items' => $items->map(fn ($i) => ['name' => $i->name, 'unit' => $i->unit, 'quantity_milli' => (int) $i->quantity_milli, 'total_cents' => (int) $i->total_cents])->values(),
        ];
    }
}
