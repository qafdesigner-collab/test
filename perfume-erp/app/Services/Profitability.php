<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

final class Profitability
{
    public static function document(object $d, iterable $lines): ?array
    {
        if (! in_array($d->kind, ['Sale', 'Invoice'])) {
            return null;
        }
        $cost = 0;
        $missing = false;
        $estimated = false;
        foreach ($lines as $line) {
            if ($line->cogs_cents === null) {
                $missing = true;

                continue;
            }$cost += $line->cogs_cents;
            $allocations = is_array($line->cost_allocations) ? $line->cost_allocations : json_decode($line->cost_allocations ?? '[]', true);
            foreach ($allocations ?? [] as $allocation) {
                if (str_contains(strtolower($allocation['cost_basis'] ?? ''), 'estimate') || ($allocation['cost_basis'] ?? '') === 'Mixed cost basis') {
                    $estimated = true;
                }
            }
        }

        return ['revenue_cents' => $d->subtotal_cents, 'cogs_cents' => $missing ? null : $cost, 'gross_profit_cents' => $missing ? null : $d->subtotal_cents - $cost, 'estimated' => $estimated, 'active' => $d->status === 'Posted'];
    }

    public static function report(): array
    {
        $rows = [];
        foreach (DB::table('products')->get() as $p) {
            $rows[$p->id] = ['product_id' => $p->id, 'name' => $p->name, 'sku' => $p->sku, 'unit' => $p->unit, 'purchased_milli' => 0, 'purchase_cents' => 0, 'sold_milli' => 0, 'revenue_cents' => 0, 'cogs_cents' => 0, 'gross_profit_cents' => 0, 'missing_cost_lines' => 0, 'stock_milli' => 0, 'stock_value_cents' => 0];
        }
        $docs = [];
        $missing = 0;
        $estimated = 0;
        foreach (DB::table('documents')->where('status', 'Posted')->whereIn('kind', ['Purchase', 'Sale', 'Invoice'])->orderByDesc('id')->get() as $d) {
            $lines = DB::table('document_lines')->where('document_id', $d->id)->get();
            $profit = self::document($d, $lines);
            if ($profit) {
                $docs[] = array_merge((array) $d, $profit);
                if ($profit['cogs_cents'] === null) {
                    $missing++;
                }if ($profit['estimated']) {
                    $estimated++;
                }
            }
            foreach ($lines as $line) {
                $row = &$rows[$line->product_id];
                if ($d->kind === 'Purchase') {
                    $row['purchased_milli'] += $line->quantity_milli;
                    $row['purchase_cents'] += $line->subtotal_cents;
                } else {
                    $row['sold_milli'] += $line->quantity_milli;
                    $row['revenue_cents'] += $line->subtotal_cents;
                    if ($line->cogs_cents === null) {
                        $row['missing_cost_lines']++;
                    } else {
                        $row['cogs_cents'] += $line->cogs_cents;
                        $row['gross_profit_cents'] += $line->subtotal_cents - $line->cogs_cents;
                    }
                }unset($row);
            }
        }
        foreach (DB::table('balances')->get() as $b) {
            $rows[$b->product_id]['stock_milli'] += $b->quantity_milli;
            $rows[$b->product_id]['stock_value_cents'] += $b->value_cents ?? Amounts::roundDivide($b->quantity_milli * DB::table('products')->where('id', $b->product_id)->value('cost_cents'), 1000);
        }

        return ['products' => array_values($rows), 'invoices' => $docs, 'missing_cost_documents' => $missing, 'estimated_cost_documents' => $estimated, 'revenue_cents' => array_sum(array_column($docs, 'revenue_cents')), 'cogs_cents' => $missing ? null : array_sum(array_column($docs, 'cogs_cents')), 'gross_profit_cents' => $missing ? null : array_sum(array_column($docs, 'gross_profit_cents')), 'purchase_cents' => array_sum(array_column($rows, 'purchase_cents')), 'stock_value_cents' => array_sum(array_column($rows, 'stock_value_cents'))];
    }
}
