<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

final class ProfitLoss
{
    /**
     * Monthly profit and loss for one calendar year.
     *
     * Revenue = posted sales and invoices excluding VAT, less returned items (counted in the sale's month).
     * Cost of goods = recorded cost of the items sold, less returned items. Expenses exclude their VAT.
     *
     * @return array{year: int, months: list<array<string, mixed>>, totals: array<string, int>, categories: list<array{category: string, amount_cents: int}>, uncosted_lines: int, years: list<int>}
     */
    public static function year(int $year): array
    {
        $from = sprintf('%04d-01-01 00:00:00', $year);
        $to = sprintf('%04d-12-31 23:59:59', $year);
        $months = [];
        for ($m = 1; $m <= 12; $m++) {
            $months[$m] = ['month' => sprintf('%04d-%02d', $year, $m), 'revenue_cents' => 0, 'cogs_cents' => 0, 'expenses_cents' => 0];
        }

        $lines = DB::table('document_lines as l')->join('documents as d', 'd.id', '=', 'l.document_id')
            ->whereIn('d.kind', ['Sale', 'Invoice'])->where('d.status', 'Posted')->whereBetween('d.created_at', [$from, $to])
            ->select('d.created_at', 'l.subtotal_cents', 'l.returned_subtotal_cents', 'l.cogs_cents', 'l.returned_cogs_cents')->get();
        $uncosted = 0;
        foreach ($lines as $line) {
            $m = (int) substr((string) $line->created_at, 5, 2);
            $months[$m]['revenue_cents'] += (int) $line->subtotal_cents - (int) $line->returned_subtotal_cents;
            if ($line->cogs_cents === null) {
                $uncosted++;
            } else {
                $months[$m]['cogs_cents'] += (int) $line->cogs_cents - (int) $line->returned_cogs_cents;
            }
        }

        $expenses = DB::table('expenses')->whereNull('voided_at')->whereBetween('spent_on', [substr($from, 0, 10), substr($to, 0, 10)])->get(['spent_on', 'category', 'amount_cents', 'tax_cents']);
        $categories = [];
        foreach ($expenses as $expense) {
            $net = (int) $expense->amount_cents - (int) $expense->tax_cents;
            $months[(int) substr((string) $expense->spent_on, 5, 2)]['expenses_cents'] += $net;
            $categories[$expense->category] = ($categories[$expense->category] ?? 0) + $net;
        }
        arsort($categories);

        $totals = ['revenue_cents' => 0, 'cogs_cents' => 0, 'gross_profit_cents' => 0, 'expenses_cents' => 0, 'net_profit_cents' => 0];
        foreach ($months as &$row) {
            $row['gross_profit_cents'] = $row['revenue_cents'] - $row['cogs_cents'];
            $row['net_profit_cents'] = $row['gross_profit_cents'] - $row['expenses_cents'];
            foreach ($totals as $key => $value) {
                $totals[$key] = $value + $row[$key];
            }
        }
        unset($row);

        $first = DB::table('documents')->min('created_at');
        $firstExpense = DB::table('expenses')->min('spent_on');
        $start = (int) substr((string) min(array_filter([$first, $firstExpense, now()->toDateString()])), 0, 4);

        return [
            'year' => $year,
            'months' => array_values($months),
            'totals' => $totals,
            'categories' => array_map(fn ($name, $amount) => ['category' => $name, 'amount_cents' => $amount], array_keys($categories), $categories),
            'uncosted_lines' => $uncosted,
            'years' => range((int) now()->format('Y'), min($start, (int) now()->format('Y'))),
        ];
    }

    public static function csv(int $year): string
    {
        $data = self::year($year);
        $out = fopen('php://temp', 'w+');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['month', 'revenue', 'cost_of_goods', 'gross_profit', 'expenses', 'net_profit']);
        $amount = fn (int $cents) => Amounts::format($cents < 0 ? -$cents : $cents, 2);
        $signed = fn (int $cents) => ($cents < 0 ? '-' : '').$amount($cents);
        foreach (array_merge($data['months'], [['month' => 'Total'] + $data['totals']]) as $row) {
            fputcsv($out, [$row['month'], $signed($row['revenue_cents']), $signed($row['cogs_cents']), $signed($row['gross_profit_cents']), $signed($row['expenses_cents']), $signed($row['net_profit_cents'])]);
        }
        rewind($out);

        return stream_get_contents($out);
    }
}
