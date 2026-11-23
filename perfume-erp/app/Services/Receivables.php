<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class Receivables
{
    public const BUCKETS = ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_over_90'];

    /**
     * What each customer still owes, split by how far past the due date it is.
     *
     * @return array{customers: list<array<string, mixed>>, totals: array<string, int>}
     */
    public static function ageing(?int $contactId = null): array
    {
        $today = Carbon::today();
        $documents = DB::table('documents as d')->join('contacts as c', 'c.id', '=', 'd.contact_id')
            ->whereIn('d.kind', ['Sale', 'Invoice'])->where('d.status', 'Posted')
            ->when($contactId, fn ($q) => $q->where('d.contact_id', $contactId))
            ->select('d.id', 'd.number', 'd.contact_id', 'c.name', 'c.phone', 'd.created_at', 'd.due_date', 'd.total_cents', 'd.paid_cents', 'd.returned_cents', 'd.refunded_cents')->get();
        $customers = [];
        $totals = array_fill_keys(self::BUCKETS, 0) + ['balance_cents' => 0];
        foreach ($documents as $doc) {
            $balance = (int) $doc->total_cents + (int) $doc->refunded_cents - (int) $doc->paid_cents - (int) $doc->returned_cents;
            if ($balance <= 0) {
                continue;
            }
            $due = Carbon::parse($doc->due_date ?: substr((string) $doc->created_at, 0, 10));
            $late = $due->lt($today) ? (int) $due->diffInDays($today) : 0;
            $bucket = match (true) {
                $late === 0 => 'current',
                $late <= 30 => 'days_1_30',
                $late <= 60 => 'days_31_60',
                $late <= 90 => 'days_61_90',
                default => 'days_over_90',
            };
            $row = &$customers[$doc->contact_id];
            $row ??= ['contact_id' => (int) $doc->contact_id, 'name' => $doc->name, 'phone' => $doc->phone, 'documents' => 0, 'oldest_days' => 0] + array_fill_keys(self::BUCKETS, 0) + ['balance_cents' => 0];
            $row[$bucket] += $balance;
            $row['balance_cents'] += $balance;
            $row['documents']++;
            $row['oldest_days'] = max($row['oldest_days'], $late);
            $totals[$bucket] += $balance;
            $totals['balance_cents'] += $balance;
            unset($row);
        }
        usort($customers, fn ($a, $b) => $b['balance_cents'] <=> $a['balance_cents']);

        return ['customers' => array_values($customers), 'totals' => $totals];
    }

    /**
     * Customer statement: opening balance, every invoice, payment, return and refund in the period
     * with a running balance, and the closing balance.
     *
     * @return array<string, mixed>
     */
    public static function statement(int $contactId, string $from, string $to): array
    {
        $events = [];
        $sales = DB::table('documents')->where('contact_id', $contactId)->whereIn('kind', ['Sale', 'Invoice'])->whereIn('status', ['Posted', 'Returned'])->get(['id', 'number', 'kind', 'created_at', 'due_date', 'total_cents']);
        foreach ($sales as $doc) {
            $events[] = ['date' => (string) $doc->created_at, 'type' => $doc->kind, 'number' => $doc->number, 'detail' => $doc->due_date ? 'Due '.$doc->due_date : '', 'debit' => (int) $doc->total_cents, 'credit' => 0];
        }
        $payments = DB::table('payments as p')->join('documents as d', 'd.id', '=', 'p.document_id')->where('d.contact_id', $contactId)->whereIn('d.kind', ['Sale', 'Invoice'])->get(['p.created_at', 'p.amount_cents', 'p.method', 'd.number']);
        foreach ($payments as $payment) {
            $events[] = ['date' => (string) $payment->created_at, 'type' => 'Payment', 'number' => $payment->number, 'detail' => $payment->method, 'debit' => 0, 'credit' => (int) $payment->amount_cents];
        }
        $returns = DB::table('documents as r')->leftJoin('documents as o', 'o.id', '=', 'r.original_id')->where('r.contact_id', $contactId)->where('r.kind', 'Return')->get(['r.created_at', 'r.number', 'r.total_cents', 'r.paid_cents', 'r.method', 'o.number as original']);
        foreach ($returns as $return) {
            $events[] = ['date' => (string) $return->created_at, 'type' => 'Return', 'number' => $return->number, 'detail' => $return->original ? 'Return of '.$return->original : '', 'debit' => 0, 'credit' => (int) $return->total_cents];
            if ((int) $return->paid_cents > 0) {
                $events[] = ['date' => (string) $return->created_at, 'type' => 'Refund', 'number' => $return->number, 'detail' => $return->method, 'debit' => (int) $return->paid_cents, 'credit' => 0];
            }
        }
        usort($events, fn ($a, $b) => [$a['date'], $a['type'] === 'Payment'] <=> [$b['date'], $b['type'] === 'Payment']);

        $opening = 0;
        $lines = [];
        $balance = 0;
        foreach ($events as $event) {
            $day = substr($event['date'], 0, 10);
            if ($day < $from) {
                $opening += $event['debit'] - $event['credit'];
                $balance = $opening;

                continue;
            }
            if ($day > $to) {
                continue;
            }
            $balance += $event['debit'] - $event['credit'];
            $lines[] = $event + ['balance' => $balance];
        }

        return [
            'customer' => DB::table('contacts')->find($contactId),
            'from' => $from,
            'to' => $to,
            'opening_cents' => $opening,
            'lines' => $lines,
            'closing_cents' => $lines ? end($lines)['balance'] : $opening,
            'ageing' => self::ageing($contactId)['totals'],
        ];
    }
}
