<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

final class Dossiers
{
    public static function projects(iterable $projects): array
    {
        $out = [];
        foreach ($projects as $p) {
            $p->artworks = DB::table('artworks')->where('project_id', $p->id)->orderByDesc('version')->get();
            $p->approvals = DB::table('approvals')->where('project_id', $p->id)->get();
            $p->workflow_events = json_decode($p->workflow_events ?? '[]', true);
            $p->supplier = $p->supplier_id ? DB::table('contacts')->find($p->supplier_id) : null;
            $p->batch = $p->batch_id ? DB::table('batches')->find($p->batch_id) : null;
            if ($p->batch) {
                $p->batch->workflow_events = json_decode($p->batch->workflow_events ?? '[]', true);
                $p->batch->costing = Costing::batch($p->batch);
            }$out[] = $p;
        }

        return $out;
    }

    public static function product(int $id): array
    {
        $p = DB::table('products')->find($id);
        abort_unless($p, 404);
        foreach (['notes', 'families', 'tags', 'fragrance_profile'] as $k) {
            $p->$k = json_decode($p->$k ?? '[]', true);
        }$p->images = DB::table('images')->where('product_id', $id)->orderBy('position')->get()->map(fn ($i) => ['url' => '/media/image/'.$i->id, 'alt' => $i->alt]);
        $formulas = DB::table('formulas')->where('product_id', $id)->orderByDesc('id')->get();
        foreach ($formulas as $f) {
            foreach (['ingredients', 'packaging'] as $k) {
                $f->$k = array_map(function ($i) {
                    $p = DB::table('products')->find($i['product_id']);

                    return $i + ['name' => $p->name, 'unit' => $p->unit];
                }, json_decode($f->$k, true));
            }
        }
        $batches = DB::table('batches')->whereIn('formula_id', $formulas->pluck('id'))->orderByDesc('id')->get();
        foreach ($batches as $b) {
            $b->workflow_events = json_decode($b->workflow_events ?? '[]', true);
            $b->costing = Costing::batch($b);
        }
        $purchases = DB::table('document_lines as l')->join('documents as d', 'd.id', '=', 'l.document_id')->leftJoin('contacts as c', 'c.id', '=', 'd.contact_id')->where('l.product_id', $id)->where('d.kind', 'Purchase')->select('d.number', 'd.created_at', 'd.bill_reference', 'l.quantity_milli', 'l.price_cents', 'l.subtotal_cents', 'c.name as supplier')->get();

        return ['product' => $p, 'formulas' => $formulas, 'batches' => $batches, 'projects' => self::projects(DB::table('projects')->where('product_id', $id)->orderByDesc('id')->get()), 'purchases' => $purchases];
    }

    public static function customer(int $id): array
    {
        $c = DB::table('contacts')->find($id);
        abort_unless($c && $c->kind === 'customer', 404);
        $projects = self::projects(DB::table('projects')->where('contact_id', $id)->orderByDesc('id')->get());
        $docs = DB::table('documents')->where('contact_id', $id)->orderByDesc('id')->get();
        $returnedSubtotals = DB::table('document_lines')->whereIn('document_id', $docs->pluck('id'))->groupBy('document_id')->selectRaw('document_id, SUM(returned_subtotal_cents) as returned')->pluck('returned', 'document_id');
        $docs->each(fn ($doc) => $doc->returned_subtotal_cents = (int) ($returnedSubtotals[$doc->id] ?? 0));
        $ids = DB::table('document_lines')->whereIn('document_id', $docs->pluck('id'))->pluck('product_id')->merge(collect($projects)->pluck('product_id'))->filter()->unique();
        $products = [];
        foreach ($ids as $p) {
            $products[] = self::product($p)['product'];
        }

        return ['customer' => $c, 'products' => $products, 'projects' => $projects, 'documents' => $docs];
    }
}
