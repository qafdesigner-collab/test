<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class Production
{
    public static function transition(int $id, string $action, array $data, int $user): array
    {
        return DB::transaction(function () use ($id, $action, $data, $user) {
            $b = DB::table('batches')->where('id', $id)->lockForUpdate()->first();
            if (! $b) {
                abort(404);
            }$f = DB::table('formulas')->find($b->formula_id);
            if ($action === 'issue') {
                if ($b->status !== 'Planned' || $f->status !== 'Approved') {
                    self::fail(__('Only a planned batch with an approved formula can be issued.'));
                }
                $sheet = $b->cost_sheet ? json_decode($b->cost_sheet, true) : ['estimate' => null, 'issued' => null, 'actual' => null];
                $sheet['issued'] = Costing::recipe($f, $b->planned);
                $ingredients = json_decode($f->ingredients, true);
                $packaging = json_decode($f->packaging, true);
                $issued = [];
                $cost = 0;
                foreach (array_merge($ingredients, $packaging) as $i) {
                    $q = $i['quantity_milli'] * $b->planned;
                    $p = DB::table('products')->find($i['product_id']);
                    if (! $p || ! $p->active) {
                        self::fail(__('A material is unavailable.'));
                    }foreach (Stock::consume($p->id, $b->location_id, $q, 'Production issue', $b->number, $user) as $lot) {
                        $issued[] = $lot;
                    }
                }
                $cost = array_sum(array_column($issued, 'cost_cents'));
                $rows = $sheet['issued']['rows'];
                foreach ($rows as &$row) {
                    $row['cost_cents'] = array_sum(array_column(array_filter($issued, fn ($lot) => $lot['product_id'] === $row['product_id']), 'cost_cents'));
                }
                unset($row);
                // Duplicate ingredients are grouped to reconcile consumed lot values exactly.
                $grouped = [];
                foreach ($rows as $row) {
                    if (isset($grouped[$row['product_id']])) {
                        $grouped[$row['product_id']]['quantity_milli'] += $row['quantity_milli'];

                        continue;
                    }$grouped[$row['product_id']] = $row;
                }
                $sheet['issued']['rows'] = array_values($grouped);
                $sheet['issued']['ingredients_cents'] = array_sum(array_column(array_filter($grouped, fn ($row) => $row['category'] === 'Ingredients'), 'cost_cents'));
                $sheet['issued']['packaging_cents'] = array_sum(array_column(array_filter($grouped, fn ($row) => $row['category'] === 'Packaging'), 'cost_cents'));
                $sheet['issued'] = Costing::finish($sheet['issued'], $cost, [], $b->planned);
                DB::table('batches')->where('id', $id)->update(['cost_sheet' => json_encode($sheet), 'issued' => json_encode($issued), 'material_cost_cents' => $cost, 'status' => 'Mixing', 'updated_at' => now()]);
            } elseif ($action === 'mature') {
                if ($b->status !== 'Mixing') {
                    self::fail(__('Start maturation only after mixing.'));
                }DB::table('batches')->where('id', $id)->update(['status' => 'Maturing', 'matures_at' => now()->addDays($f->maturation_days), 'updated_at' => now()]);
            } elseif ($action === 'qc') {
                if ($b->status !== 'Maturing') {
                    self::fail(__('Quality release requires maturation.'));
                }if ($b->matures_at && now()->lt($b->matures_at)) {
                    self::fail(__('The configured maturation period has not finished.'));
                }if (trim($data['qc_notes'] ?? '') === '') {
                    self::fail(__('Record the quality observations.'));
                }DB::table('batches')->where('id', $id)->update(['status' => ($data['passed'] ?? false) ? 'Released' : 'QC Hold', 'qc_notes' => $data['qc_notes'], 'updated_at' => now()]);
            } elseif ($action === 'recheck') {
                if ($b->status !== 'QC Hold') {
                    self::fail(__('Only a held batch can be rechecked.'));
                }DB::table('batches')->where('id', $id)->update(['status' => 'Maturing', 'updated_at' => now()]);
            } elseif ($action === 'complete') {
                if ($b->status !== 'Released') {
                    self::fail(__('Batch must pass quality checks first.'));
                }$accepted = (int) ($data['accepted'] ?? -1);
                $rejected = (int) ($data['rejected'] ?? -1);
                if ($accepted < 1 || $rejected < 0 || $accepted + $rejected !== $b->planned) {
                    self::fail(__('Accepted plus rejected units must equal planned units.'));
                }if ($rejected && ! trim($data['loss_reason'] ?? '')) {
                    self::fail(__('Explain rejected units or losses.'));
                }$extras = Costing::extras($data);
                $extras['legacy_cents'] = Amounts::parse($data['extra_cost'] ?? '0');
                $extra = array_sum($extras);
                $sheet = $b->cost_sheet ? json_decode($b->cost_sheet, true) : ['estimate' => null, 'issued' => null, 'actual' => null];
                $sheet['actual'] = Costing::finish($sheet['issued'], $b->material_cost_cents, $extras, $accepted);
                Stock::move($f->product_id, $b->location_id, $b->number, $accepted * 1000, 'Production output', $b->number, $user, $sheet['actual']['total_cents'], collect(json_decode($b->issued, true))->contains(fn ($lot) => str_contains(strtolower($lot['cost_basis'] ?? ''), 'estimate') || ($lot['cost_basis'] ?? '') === 'Mixed cost basis') ? 'Production cost with estimates' : 'Production batch cost');
                DB::table('batches')->where('id', $id)->update(['cost_sheet' => json_encode($sheet), 'status' => 'Completed', 'accepted' => $accepted, 'rejected' => $rejected, 'loss_reason' => $data['loss_reason'] ?? null, 'extra_cost_cents' => $extra, 'updated_at' => now()]);
            } else {
                self::fail(__('Unknown batch action.'));
            }
            $events = json_decode($b->workflow_events ?? '[]', true);
            $events[] = ['stage' => $action, 'at' => now()->toIso8601String(), 'notes' => $data['qc_notes'] ?? $data['loss_reason'] ?? ''];
            DB::table('batches')->where('id', $id)->update(['workflow_events' => json_encode($events)]);
            DB::table('audit')->insert(['user_id' => $user, 'action' => 'batch.'.$action, 'subject' => $b->number, 'details' => null, 'created_at' => now()]);

            return ['id' => $id];
        }, 3);
    }

    public static function fail(string $m): never
    {
        throw ValidationException::withMessages(['batch' => $m]);
    }
}
