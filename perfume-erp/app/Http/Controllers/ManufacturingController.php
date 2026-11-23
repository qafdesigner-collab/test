<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use App\Services\Costing;
use App\Services\Documents;
use App\Services\Production;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Confidential formulas and production batches.
 */
class ManufacturingController extends ErpBaseController
{
    public function formulas()
    {
        $this->allow(['manager', 'production']);
        $this->audit('formula.read', 'formula-list');

        return ['formulas' => DB::table('formulas as f')->join('products as p', 'p.id', '=', 'f.product_id')->select('f.*', 'p.name as product')->orderByDesc('f.id')->get()->map(function ($f) {
            $f->costing = Costing::recipe($f, 1);
            $f->ingredients = json_decode($f->ingredients, true);
            $f->packaging = json_decode($f->packaging, true);

            return $f;
        })];
    }

    public function saveFormula(Request $r)
    {
        $this->allow(['manager', 'production']);
        $v = $r->validate(['code' => 'required|string|max:40', 'name' => 'required|string|max:150', 'product_id' => 'required|exists:products,id', 'ingredients' => 'required|array|min:1|max:100', 'ingredients.*.product_id' => 'required|exists:products,id', 'ingredients.*.quantity' => 'required', 'packaging' => 'present|array|max:50', 'packaging.*.product_id' => 'required|exists:products,id', 'packaging.*.quantity' => 'required', 'instructions' => 'nullable|string|max:5000', 'maturation_days' => 'required|integer|min:0|max:365']);
        $p = DB::table('products')->find($v['product_id']);
        if ($p->kind !== 'finished' || ! in_array($p->unit, ['bottle', 'piece'])) {
            Documents::fail(__('Formula output must be a finished bottle/piece product.'));
        }foreach (['ingredients', 'packaging'] as $key) {
            $rows = [];
            foreach ($v[$key] as $i) {
                $material = DB::table('products')->find($i['product_id']);
                if ($key === 'ingredients' && ! in_array($material->kind, ['raw', 'intermediate'])) {
                    Documents::fail(__('Ingredients must be raw or intermediate products.'));
                }if ($key === 'packaging' && $material->kind !== 'packaging') {
                    Documents::fail(__('Packaging rows must use packaging products.'));
                }$q = Amounts::parse($i['quantity'], 3);
                if ($q <= 0 || $q > 100000) {
                    Documents::fail(__('Per-bottle material quantity must be positive and no more than 100 base units.'));
                }if (in_array($material->unit, ['piece', 'bottle', 'box', 'carton']) && $q % 1000) {
                    Documents::fail(__('Packaging/count units must be whole numbers.'));
                }$rows[] = ['product_id' => $i['product_id'], 'quantity_milli' => $q, 'unit' => $material->unit, 'name' => $material->name];
            }$v[$key] = json_encode($rows);
        }

        return DB::transaction(function () use ($v) {
            $v['version'] = 1 + (int) DB::table('formulas')->where('code', $v['code'])->max('version');
            $id = DB::table('formulas')->insertGetId($v + ['user_id' => Auth::id(), 'created_at' => now(), 'updated_at' => now()]);
            $this->audit('formula.create', 'formula:'.$id);

            return ['id' => $id];
        });
    }

    public function approveFormula(int $id)
    {
        $this->allow(['manager']);
        abort_unless(DB::table('formulas')->where('id', $id)->exists(), 404);
        DB::table('formulas')->where('id', $id)->where('status', 'Draft')->update(['status' => 'Approved', 'updated_at' => now()]);
        $this->audit('formula.approve', 'formula:'.$id);

        return ['ok' => true];
    }

    public function batches(Request $r)
    {
        $this->allow(['manager', 'production', 'warehouse']);
        if ($r->isMethod('post')) {
            $this->allow(['manager', 'production']);
            $v = $r->validate(['formula_id' => 'required|exists:formulas,id', 'location_id' => 'required|exists:locations,id', 'planned' => 'required|integer|min:1|max:100000', 'estimated_labour_cost' => 'nullable', 'estimated_overhead_cost' => 'nullable', 'estimated_freight_cost' => 'nullable', 'estimated_other_cost' => 'nullable']);
            if (DB::table('formulas')->where('id', $v['formula_id'])->value('status') !== 'Approved') {
                Documents::fail(__('Approve the formula first.'));
            }

            return $this->once($r, 'batch.create', function () use ($v) {
                $estimate = Costing::recipe(DB::table('formulas')->find($v['formula_id']), (int) $v['planned'], Costing::extras($v, 'estimated_'));
                foreach (['estimated_labour_cost', 'estimated_overhead_cost', 'estimated_freight_cost', 'estimated_other_cost'] as $k) {
                    unset($v[$k]);
                }
                $v['cost_sheet'] = json_encode(['estimate' => $estimate, 'issued' => null, 'actual' => null]);
                $id = DB::table('batches')->insertGetId($v + ['user_id' => Auth::id(), 'created_at' => now(), 'updated_at' => now()]);
                DB::table('batches')->where('id', $id)->update(['number' => 'BAT-'.str_pad((string) $id, 6, '0', STR_PAD_LEFT)]);

                return ['id' => $id];
            });
        }

        return ['batches' => DB::table('batches as b')->join('formulas as f', 'f.id', '=', 'b.formula_id')->join('products as p', 'p.id', '=', 'f.product_id')->select('b.*', 'p.name as product', 'f.name as formula_name', 'f.version', 'p.price_cents as selling_price_cents')->orderByDesc('b.id')->get()->map(function ($b) {
            $b->costing = in_array(Auth::user()->role, ['owner', 'manager', 'production']) ? Costing::batch($b) : null;
            unset($b->cost_sheet);

            return $b;
        })];
    }

    public function batchAction(Request $r, int $id)
    {
        $this->allow(['manager', 'production']);
        $r->validate(['action' => ['required', Rule::in(['issue', 'mature', 'qc', 'recheck', 'complete'])], 'accepted' => 'nullable|integer|min:0|max:100000', 'rejected' => 'nullable|integer|min:0|max:100000', 'passed' => 'nullable|boolean', 'qc_notes' => 'nullable|string|max:3000', 'loss_reason' => 'nullable|string|max:3000', 'extra_cost' => 'nullable', 'labour_cost' => 'nullable', 'overhead_cost' => 'nullable', 'freight_cost' => 'nullable', 'other_cost' => 'nullable']);

        return $this->once($r, 'batch.action', fn () => Production::transition($id, $r->input('action'), $r->all(), Auth::id()));
    }
}
