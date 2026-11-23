<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class Stock
{
    public static function move(int $product, int $location, string $lot, int $q, string $reason, string $source, ?int $user, ?int $value = null, string $basis = 'Configured estimate'): int
    {
        if ($q === 0) {
            return 0;
        }
        $key = ['product_id' => $product, 'location_id' => $location, 'lot' => $lot];
        DB::table('balances')->insertOrIgnore($key + ['quantity_milli' => 0]);
        $row = DB::table('balances')->where($key)->lockForUpdate()->first();
        $currentValue = $row->value_cents ?? Amounts::roundDivide($row->quantity_milli * DB::table('products')->where('id', $product)->value('cost_cents'), 1000);
        $amount = $q < 0 ? ($row->quantity_milli > 0 ? Amounts::roundDivide($currentValue * (-$q), $row->quantity_milli) : 0) : ($value ?? Amounts::roundDivide($q * DB::table('products')->where('id', $product)->value('cost_cents'), 1000));
        if ($q < 0 && -$q > $row->quantity_milli) {
            throw ValidationException::withMessages(['stock' => 'Insufficient stock.']);
        }

        // Conditional update remains safe even where row locking differs (SQLite).
        $query = DB::table('balances')->where('id', $row->id);
        if ($q < 0) {
            $query->where('quantity_milli', '>=', -$q);
        }
        if (! $query->increment('quantity_milli', $q)) {
            throw ValidationException::withMessages(['stock' => 'Insufficient stock for '.DB::table('products')->where('id', $product)->value('name').'.']);
        }
        DB::table('balances')->where('id', $row->id)->update(['value_cents' => $currentValue + ($q < 0 ? -$amount : $amount), 'cost_basis' => $q < 0 ? $row->cost_basis : ($row->quantity_milli > 0 && $row->cost_basis !== $basis ? 'Mixed cost basis' : $basis)]);
        DB::table('movements')->insert($key + ['quantity_milli' => $q, 'reason' => $reason, 'source' => $source, 'user_id' => $user, 'created_at' => now()]);

        return $amount;
    }

    public static function consume(int $product, int $location, int $q, string $reason, string $source, ?int $user): array
    {
        $lots = DB::table('balances')->where(['product_id' => $product, 'location_id' => $location])->where('quantity_milli', '>', 0)->orderBy('id')->lockForUpdate()->get();
        $used = [];
        foreach ($lots as $lot) {
            $take = min($q, (int) $lot->quantity_milli);
            if ($take > 0) {
                $cost = self::move($product, $location, $lot->lot, -$take, $reason, $source, $user);
                $used[] = ['product_id' => $product, 'lot' => $lot->lot, 'quantity_milli' => $take, 'cost_cents' => $cost, 'cost_basis' => $lot->cost_basis];
                $q -= $take;
            }if (! $q) {
                break;
            }
        }
        if ($q > 0) {
            throw ValidationException::withMessages(['stock' => 'Insufficient stock for '.DB::table('products')->where('id', $product)->value('name').'.']);
        }

        return $used;
    }
}
