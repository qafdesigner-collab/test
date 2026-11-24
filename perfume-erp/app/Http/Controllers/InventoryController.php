<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use App\Services\Documents;
use App\Services\Reorder;
use App\Services\Stock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Stock balances, movements, adjustments and transfers.
 */
class InventoryController extends ErpBaseController
{
    public function inventory()
    {
        $this->allow(['manager', 'warehouse', 'production', 'accountant']);

        return ['balances' => Stock::balances(), 'movements' => DB::table('movements as m')->join('products as p', 'p.id', '=', 'm.product_id')->join('locations as l', 'l.id', '=', 'm.location_id')->select('m.*', 'p.name', 'p.unit', 'l.name as location')->orderByDesc('m.id')->limit(150)->get()];
    }

    public function stock(Request $r)
    {
        $this->allow(['manager', 'warehouse']);
        $v = $r->validate(['product_id' => 'required|exists:products,id', 'location_id' => 'required|exists:locations,id', 'lot' => 'required|string|max:60', 'quantity' => 'required', 'reason' => 'required|string|max:200', 'target_id' => 'nullable|exists:locations,id']);
        $q = Amounts::parse($v['quantity'], 3, true);
        if (! $q || abs($q) > 1000000000) {
            Documents::fail(__('Quantity must be nonzero and within 1,000,000 base units.'));
        }if (DB::table('products')->where('id', $v['product_id'])->value('kind') === 'service') {
            Documents::fail(__('Services do not have stock.'));
        }$unit = DB::table('products')->where('id', $v['product_id'])->value('unit');
        if (in_array($unit, ['piece', 'bottle', 'box', 'carton']) && $q % 1000) {
            Documents::fail(__('Counted products require whole quantities.'));
        }

        return $this->once($r, 'stock', function () use ($v, $q) {
            $source = 'ADJ-'.Str::uuid();
            if (! empty($v['target_id'])) {
                if ($q < 0 || $v['target_id'] == $v['location_id']) {
                    Documents::fail(__('Transfer requires a positive quantity and a different destination.'));
                }$transferValue = Stock::move($v['product_id'], $v['location_id'], $v['lot'], -$q, 'Transfer out: '.$v['reason'], $source, Auth::id());
                Stock::move($v['product_id'], $v['target_id'], $v['lot'], $q, 'Transfer in: '.$v['reason'], $source, Auth::id(), $transferValue, DB::table('balances')->where(['product_id' => $v['product_id'], 'location_id' => $v['location_id'], 'lot' => $v['lot']])->value('cost_basis'));
            } else {
                Stock::move($v['product_id'], $v['location_id'], $v['lot'], $q, $v['reason'], $source, Auth::id());
            }$this->audit('stock.adjust', $source);

            return ['ok' => true];
        });
    }

    /**
     * Set or clear the expiry date of a lot.
     */
    public function lotExpiry(Request $r)
    {
        $this->allow(['manager', 'warehouse']);
        $v = $r->validate(['product_id' => 'required|exists:products,id', 'lot' => 'required|string|max:60', 'expires_on' => 'nullable|date_format:Y-m-d']);
        abort_unless(DB::table('balances')->where(['product_id' => $v['product_id'], 'lot' => $v['lot']])->exists(), 404, __('That lot does not exist.'));
        Stock::setExpiry((int) $v['product_id'], $v['lot'], $v['expires_on'] ?? null);
        $this->audit('stock.expiry', $v['lot'], ['product_id' => (int) $v['product_id'], 'expires_on' => $v['expires_on'] ?? null]);

        return ['ok' => true];
    }

    /**
     * Recent stock counts, or post a new one.
     */
    public function counts(Request $r)
    {
        $this->allow(['manager', 'warehouse']);
        if ($r->isMethod('post')) {
            $v = $r->validate(['location_id' => 'required|exists:locations,id', 'notes' => 'nullable|string|max:1000', 'lines' => 'required|array|min:1|max:2000', 'lines.*.product_id' => 'required|exists:products,id', 'lines.*.lot' => 'required|string|max:60', 'lines.*.expected' => 'required', 'lines.*.counted' => 'required']);

            return $this->once($r, 'stock.count', fn () => Stock::postCount((int) $v['location_id'], $v['lines'], $v['notes'] ?? null, Auth::id()));
        }

        return ['counts' => DB::table('stock_counts as c')->join('locations as l', 'l.id', '=', 'c.location_id')->join('users as u', 'u.id', '=', 'c.user_id')
            ->whereNotNull('c.number')->select('c.*', 'l.name as location', 'u.name as user')->orderByDesc('c.id')->limit(30)->get()];
    }

    /**
     * Products to reorder, grouped by supplier.
     */
    public function reorder()
    {
        $this->allow(['manager', 'warehouse', 'accountant']);

        return ['groups' => Reorder::suggestions()];
    }
}
