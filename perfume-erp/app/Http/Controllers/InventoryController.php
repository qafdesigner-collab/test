<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use App\Services\Documents;
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
            Documents::fail('Quantity must be nonzero and within 1,000,000 base units.');
        }if (DB::table('products')->where('id', $v['product_id'])->value('kind') === 'service') {
            Documents::fail('Services do not have stock.');
        }$unit = DB::table('products')->where('id', $v['product_id'])->value('unit');
        if (in_array($unit, ['piece', 'bottle', 'box', 'carton']) && $q % 1000) {
            Documents::fail('Counted products require whole quantities.');
        }

        return $this->once($r, 'stock', function () use ($v, $q) {
            $source = 'ADJ-'.Str::uuid();
            if (! empty($v['target_id'])) {
                if ($q < 0 || $v['target_id'] == $v['location_id']) {
                    Documents::fail('Transfer requires a positive quantity and a different destination.');
                }$transferValue = Stock::move($v['product_id'], $v['location_id'], $v['lot'], -$q, 'Transfer out: '.$v['reason'], $source, Auth::id());
                Stock::move($v['product_id'], $v['target_id'], $v['lot'], $q, 'Transfer in: '.$v['reason'], $source, Auth::id(), $transferValue, DB::table('balances')->where(['product_id' => $v['product_id'], 'location_id' => $v['location_id'], 'lot' => $v['lot']])->value('cost_basis'));
            } else {
                Stock::move($v['product_id'], $v['location_id'], $v['lot'], $q, $v['reason'], $source, Auth::id());
            }$this->audit('stock.adjust', $source);

            return ['ok' => true];
        });
    }
}
