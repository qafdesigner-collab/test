<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

final class Costing
{
    public static function extras(array $v, string $prefix = ''): array
    {
        $out = [];
        foreach (['labour', 'overhead', 'freight', 'other'] as $k) {
            $out[$k.'_cents'] = Amounts::parse($v[$prefix.$k.'_cost'] ?? '0');
        }

        return $out;
    }

    public static function finish(?array $sheet, int $materials, array $extras, int $output): array
    {
        $total = $materials + array_sum($extras);

        return array_merge($sheet ?? [], ['extras' => $extras, 'material_cost_cents' => $materials, 'total_cents' => $total, 'output' => $output, 'unit_cost_cents' => $output > 0 ? Amounts::roundDivide($total, $output) : null]);
    }

    public static function recipe(object $f, int $output, array $extras = []): array
    {
        $rows = [];
        $ingredients = 0;
        $packaging = 0;
        foreach (['ingredients' => 'Ingredients', 'packaging' => 'Packaging'] as $k => $category) {
            foreach (json_decode($f->$k, true) as $i) {
                $p = DB::table('products')->find($i['product_id']);
                if (! $p || ! $p->active) {
                    Production::fail('A formula material is unavailable.');
                }
                $q = $i['quantity_milli'] * $output;
                $cost = Amounts::roundDivide($q * $p->cost_cents, 1000);
                $rows[] = ['product_id' => $p->id, 'name' => $p->name, 'unit' => $p->unit, 'category' => $category, 'quantity_milli' => $q, 'unit_cost_cents' => $p->cost_cents, 'cost_cents' => $cost];
                if ($k === 'ingredients') {
                    $ingredients += $cost;
                } else {
                    $packaging += $cost;
                }
            }
        }

        return self::finish(['rows' => $rows, 'ingredients_cents' => $ingredients, 'packaging_cents' => $packaging], $ingredients + $packaging, $extras, $output);
    }

    public static function batch(object $b): array
    {
        if ($b->cost_sheet) {
            return json_decode($b->cost_sheet, true);
        }

        return ['estimate' => null, 'issued' => null, 'actual' => $b->status === 'Completed' ? self::finish(null, $b->material_cost_cents, ['legacy_cents' => $b->extra_cost_cents], $b->accepted) : null, 'legacy' => true];
    }
}
