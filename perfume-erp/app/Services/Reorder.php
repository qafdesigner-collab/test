<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

final class Reorder
{
    /**
     * Products whose stock plus open purchase orders is at or below the reorder level, grouped by the
     * supplier they were last bought from. Suggested quantity tops stock up to twice the reorder level.
     *
     * @return list<array{supplier_id: ?int, supplier: ?string, items: list<array<string, mixed>>}>
     */
    public static function suggestions(): array
    {
        $stock = DB::table('balances')->groupBy('product_id')->selectRaw('product_id, SUM(quantity_milli) as qty')->pluck('qty', 'product_id');
        $onOrder = DB::table('document_lines as l')->join('documents as d', 'd.id', '=', 'l.document_id')
            ->where('d.kind', 'PurchaseOrder')->whereIn('d.status', ['Ordered', 'Partially received'])
            ->groupBy('l.product_id')->selectRaw('l.product_id, SUM(l.quantity_milli - l.received_milli) as qty')->pluck('qty', 'product_id');
        $groups = [];
        foreach (DB::table('products')->where('active', true)->where('kind', '!=', 'service')->where('reorder_milli', '>', 0)->orderBy('name')->get() as $p) {
            $available = (int) ($stock[$p->id] ?? 0);
            $ordered = (int) ($onOrder[$p->id] ?? 0);
            if ($available + $ordered > $p->reorder_milli) {
                continue;
            }
            $last = DB::table('document_lines as l')->join('documents as d', 'd.id', '=', 'l.document_id')->leftJoin('contacts as c', 'c.id', '=', 'd.contact_id')
                ->where('l.product_id', $p->id)->where('d.kind', 'Purchase')->where('d.status', 'Posted')
                ->orderByDesc('d.id')->first(['d.contact_id', 'c.name', 'l.price_cents']);
            $suggested = max($p->reorder_milli * 2 - $available - $ordered, 0);
            if (in_array($p->unit, ['piece', 'bottle', 'box', 'carton'])) {
                $suggested = (int) ceil($suggested / 1000) * 1000;
            }
            $key = $last->contact_id ?? 0;
            $groups[$key] ??= ['supplier_id' => $last->contact_id ?? null, 'supplier' => $last->name ?? null, 'items' => []];
            $groups[$key]['items'][] = [
                'product_id' => $p->id, 'name' => $p->name, 'sku' => $p->sku, 'unit' => $p->unit,
                'stock_milli' => $available, 'on_order_milli' => $ordered, 'reorder_milli' => (int) $p->reorder_milli,
                'suggested_milli' => $suggested, 'last_cost_cents' => (int) ($last->price_cents ?? $p->cost_cents),
            ];
        }
        ksort($groups);

        return array_values(array_reverse($groups));
    }
}
