<?php

namespace App\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class Stock
{
    /**
     * Current lot balances per location, with product and location names.
     */
    public static function balances(): Collection
    {
        return DB::table('balances as b')->join('products as p', 'p.id', '=', 'b.product_id')->join('locations as l', 'l.id', '=', 'b.location_id')
            ->leftJoin('lot_details as x', fn ($j) => $j->on('x.product_id', '=', 'b.product_id')->on('x.lot', '=', 'b.lot'))
            ->select('b.*', 'p.name', 'p.sku', 'p.unit', 'l.name as location', 'x.expires_on')->orderBy('p.name')->get();
    }

    /**
     * Record (or clear) the expiry date of a lot. The date belongs to the lot in every location.
     */
    public static function setExpiry(int $product, string $lot, ?string $expiresOn): void
    {
        DB::table('lot_details')->updateOrInsert(['product_id' => $product, 'lot' => $lot], ['expires_on' => $expiresOn, 'updated_at' => now(), 'created_at' => now()]);
    }

    /**
     * Lots with stock that expire on or before the given number of days from today (already expired included).
     */
    public static function expiring(int $days = 60): Collection
    {
        return DB::table('balances as b')->join('lot_details as x', fn ($j) => $j->on('x.product_id', '=', 'b.product_id')->on('x.lot', '=', 'b.lot'))
            ->join('products as p', 'p.id', '=', 'b.product_id')->join('locations as l', 'l.id', '=', 'b.location_id')
            ->where('b.quantity_milli', '>', 0)->whereNotNull('x.expires_on')->where('x.expires_on', '<=', now()->addDays($days)->toDateString())
            ->select('b.product_id', 'p.name', 'p.unit', 'b.lot', 'l.name as location', 'b.quantity_milli', 'x.expires_on')->orderBy('x.expires_on')->limit(50)->get();
    }

    /**
     * Post a physical stock count for one location. Each line gives the quantity the system showed when
     * counting began (expected) and what was physically counted. If stock moved meanwhile, the line must be
     * recounted. Differences become adjustments with the count number as their source.
     *
     * @param  list<array{product_id: int, lot: string, expected: string, counted: string}>  $lines
     */
    public static function postCount(int $location, array $lines, ?string $notes, int $user): array
    {
        return DB::transaction(function () use ($location, $lines, $notes, $user) {
            $id = DB::table('stock_counts')->insertGetId(['location_id' => $location, 'user_id' => $user, 'notes' => $notes, 'created_at' => now()]);
            $number = 'SC-'.str_pad((string) $id, 6, '0', STR_PAD_LEFT);
            $changed = [];
            $adjustments = 0;
            $valueChange = 0;
            foreach ($lines as $line) {
                $product = DB::table('products')->find($line['product_id']);
                $expected = Amounts::parse((string) $line['expected'], 3, true);
                $counted = Amounts::parse((string) $line['counted'], 3);
                if (in_array($product->unit, ['piece', 'bottle', 'box', 'carton']) && $counted % 1000) {
                    throw ValidationException::withMessages(['stock' => "Count {$product->name} in whole {$product->unit}s."]);
                }
                $balance = DB::table('balances')->where(['product_id' => $product->id, 'location_id' => $location, 'lot' => $line['lot']])->lockForUpdate()->first();
                $current = (int) ($balance->quantity_milli ?? 0);
                if ($current !== $expected) {
                    $changed[] = $product->name.' · '.$line['lot'];

                    continue;
                }
                $difference = $counted - $current;
                if ($difference !== 0) {
                    $before = (int) ($balance->value_cents ?? 0);
                    self::move($product->id, $location, $line['lot'], $difference, 'Stock count '.$number, $number, $user);
                    $valueChange += (int) DB::table('balances')->where(['product_id' => $product->id, 'location_id' => $location, 'lot' => $line['lot']])->value('value_cents') - $before;
                    $adjustments++;
                }
                DB::table('stock_count_lines')->insert(['stock_count_id' => $id, 'product_id' => $product->id, 'lot' => $line['lot'], 'expected_milli' => $expected, 'counted_milli' => $counted, 'difference_milli' => $difference]);
            }
            if ($changed) {
                throw ValidationException::withMessages(['stock' => 'Stock moved while you were counting. Reload and recount: '.implode(', ', array_slice($changed, 0, 5)).(count($changed) > 5 ? '…' : '')]);
            }
            DB::table('stock_counts')->where('id', $id)->update(['number' => $number, 'lines_counted' => count($lines), 'adjustments' => $adjustments, 'value_change_cents' => $valueChange]);
            DB::table('audit')->insert(['user_id' => $user, 'action' => 'stock.count', 'subject' => $number, 'details' => json_encode(['location_id' => $location, 'adjustments' => $adjustments, 'value_change_cents' => $valueChange]), 'created_at' => now()]);

            return ['id' => $id, 'number' => $number, 'lines_counted' => count($lines), 'adjustments' => $adjustments, 'value_change_cents' => $valueChange];
        });
    }

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
