<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use App\Services\Documents;
use App\Services\ReferenceLibrary;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Products, inspiration references and product images.
 */
class CatalogueController extends ErpBaseController
{
    public function products(Request $r)
    {
        $q = DB::table('products as p')->leftJoin('references as r', 'r.id', '=', 'p.reference_id')->select('p.*', 'r.brand as reference_brand', 'r.name as reference_name');
        if ($r->filled('search')) {
            $s = '%'.$r->string('search').'%';
            $q->where(function ($x) use ($s) {
                $x->where('p.name', 'like', $s)->orWhere('p.sku', 'like', $s)->orWhere('p.barcode', 'like', $s)->orWhere('r.name', 'like', $s)->orWhere('r.brand', 'like', $s)->orWhere('p.notes', 'like', $s);
            });
        }
        if ($r->filled('kind')) {
            $q->where('p.kind', $r->string('kind'));
        }
        $products = $q->orderBy('p.name')->get();
        $cost = in_array(Auth::user()->role, ['owner', 'manager', 'accountant', 'production', 'warehouse']);
        foreach ($products as $p) {
            foreach (['families', 'notes', 'tags'] as $k) {
                $p->$k = json_decode($p->$k, true);
            }$p->fragrance_profile = $p->fragrance_profile ? json_decode($p->fragrance_profile, true) : [];
            $p->images = DB::table('images')->where('product_id', $p->id)->orderBy('position')->orderBy('id')->get()->map(fn ($i) => ['id' => $i->id, 'url' => '/media/image/'.$i->id, 'alt' => $i->alt, 'position' => $i->position]);
            $p->stock_milli = (int) DB::table('balances')->where('product_id', $p->id)->when($r->filled('location_id'), fn ($x) => $x->where('location_id', $r->integer('location_id')))->sum('quantity_milli');
            if (! $cost) {
                unset($p->cost_cents);
            }
        }
        if ($r->filled('family')) {
            $products = $products->filter(fn ($p) => in_array((string) $r->string('family'), $p->families));
        }if ($r->filled('audience')) {
            $products = $products->filter(fn ($p) => $p->audience === (string) $r->string('audience'));
        }if ($r->filled('style')) {
            $products = $products->filter(fn ($p) => $p->style === (string) $r->string('style'));
        }if ($r->boolean('in_stock')) {
            $products = $products->filter(fn ($p) => $p->stock_milli > 0 || $p->kind === 'service');
        }

        return ['products' => $products->values()];
    }

    public function saveProduct(Request $r, ?int $id = null)
    {
        $this->allow(['manager', 'warehouse']);
        $v = $r->validate(['sku' => ['required', 'string', 'max:60', Rule::unique('products')->ignore($id)], 'name' => 'required|string|max:150', 'name_ar' => 'nullable|string|max:150', 'kind' => ['required', Rule::in(['finished', 'raw', 'packaging', 'resale', 'service', 'intermediate'])], 'unit' => ['required', Rule::in(['ml', 'litre', 'g', 'kg', 'piece', 'bottle', 'box', 'carton', 'hour'])], 'barcode' => ['nullable', 'string', 'max:80', Rule::unique('products')->ignore($id)], 'price' => 'required', 'cost' => 'required', 'tax' => 'required', 'reorder' => 'required', 'families' => 'present|array|max:20', 'families.*' => 'string|max:50', 'notes' => 'present|array|max:30', 'notes.*' => 'string|max:80', 'tags' => 'present|array|max:30', 'tags.*' => 'string|max:50', 'style' => 'nullable|string|max:60', 'origin' => 'nullable|string|max:60', 'audience' => 'nullable|string|max:60', 'concentration' => 'nullable|string|max:40', 'size' => 'nullable|string|max:40', 'description' => 'nullable|string|max:4000', 'reference_id' => 'nullable|exists:references,id', 'active' => 'required|boolean', 'sales_allowed' => 'sometimes|boolean', 'fragrance_profile' => 'sometimes|array:top_notes,heart_notes,base_notes,smell_description,intensity,longevity,projection,season,occasion', 'fragrance_profile.top_notes' => 'sometimes|array|max:30', 'fragrance_profile.heart_notes' => 'sometimes|array|max:30', 'fragrance_profile.base_notes' => 'sometimes|array|max:30', 'fragrance_profile.top_notes.*' => 'string|max:80', 'fragrance_profile.heart_notes.*' => 'string|max:80', 'fragrance_profile.base_notes.*' => 'string|max:80', 'fragrance_profile.smell_description' => 'sometimes|nullable|string|max:2000', 'fragrance_profile.intensity' => 'sometimes|nullable|string|max:150', 'fragrance_profile.longevity' => 'sometimes|nullable|string|max:150', 'fragrance_profile.projection' => 'sometimes|nullable|string|max:150', 'fragrance_profile.season' => 'sometimes|nullable|string|max:150', 'fragrance_profile.occasion' => 'sometimes|nullable|string|max:150']);
        if (isset($v['fragrance_profile'])) {
            $v['fragrance_profile'] = json_encode($v['fragrance_profile']);
        }
        $v['sales_allowed'] = $v['sales_allowed'] ?? ($id ? (bool) DB::table('products')->where('id', $id)->value('sales_allowed') : in_array($v['kind'], ['finished', 'resale', 'service']));
        $v['price_cents'] = Amounts::parse($v['price']);
        $v['cost_cents'] = Amounts::parse($v['cost']);
        $v['tax_bp'] = Amounts::parse($v['tax']);
        $v['reorder_milli'] = Amounts::parse($v['reorder'], 3);
        if ($v['price_cents'] > 10000000 || $v['cost_cents'] > 10000000) {
            Documents::fail(__('Price or cost cannot exceed 100,000 per base unit.'));
        }if ($v['tax_bp'] > 10000) {
            Documents::fail(__('Tax percentage cannot exceed 100.'));
        }unset($v['price'],$v['cost'],$v['tax'],$v['reorder']);
        foreach (['families', 'notes', 'tags'] as $k) {
            $v[$k] = json_encode(array_values(array_unique($v[$k])));
        }$v['barcode'] = $v['barcode'] ?? null;
        $v['updated_at'] = now();
        if ($id) {
            abort_unless(DB::table('products')->where('id', $id)->exists(), 404);
            $old = DB::table('products')->find($id);
            if (($old->unit !== $v['unit'] || $old->kind !== $v['kind']) && (DB::table('movements')->where('product_id', $id)->exists() || DB::table('document_lines')->where('product_id', $id)->exists() || DB::table('formulas')->exists())) {
                Documents::fail(__('Unit/type cannot change after operational use. Create a new SKU.'));
            }DB::table('products')->where('id', $id)->update($v);
        } else {
            $v['created_at'] = now();
            $id = DB::table('products')->insertGetId($v);
        }$this->audit('product.save', 'product:'.$id);

        return ['id' => $id];
    }

    public function references(Request $r)
    {
        $this->allow(['manager', 'warehouse', 'cashier', 'production']);
        if ($r->isMethod('post')) {
            $this->allow(['manager', 'warehouse']);
            $v = $r->validate(['brand' => 'required|string|max:100', 'name' => ['required', 'string', 'max:150', Rule::unique('references')->where('brand', $r->input('brand'))], 'notes' => 'nullable|string|max:2000', 'gender' => ['nullable', Rule::in(['Men', 'Women', 'Unisex'])], 'family' => 'nullable|string|max:80', 'top_notes' => 'nullable|string|max:500', 'heart_notes' => 'nullable|string|max:500', 'base_notes' => 'nullable|string|max:500']);
            if (empty($v['notes'])) {
                $v['notes'] = implode(', ', array_filter([$v['top_notes'] ?? null, $v['heart_notes'] ?? null, $v['base_notes'] ?? null])) ?: null;
            }
            $id = DB::table('references')->insertGetId($v + ['created_at' => now(), 'updated_at' => now()]);

            return ['id' => $id];
        }

        return ['references' => DB::table('references')->orderBy('brand')->orderBy('name')->get()];
    }

    public function uploadImage(Request $r, int $id)
    {
        $this->allow(['manager', 'warehouse']);
        abort_unless(DB::table('products')->where('id', $id)->exists(), 404);
        $r->validate(['image' => 'required|image|mimes:jpg,jpeg,png,webp|max:8192|dimensions:max_width=4096,max_height=4096', 'alt' => 'nullable|string|max:180']);
        if (DB::table('images')->where('product_id', $id)->count() >= 12) {
            Documents::fail(__('Maximum 12 images per product.'));
        }$file = $r->file('image');
        $raw = file_get_contents($file->getRealPath());
        $image = @imagecreatefromstring($raw);
        if (! $image) {
            Documents::fail(__('Image cannot be decoded.'));
        }$key = (string) Str::uuid();
        $path = $file->storeAs('products', $key.'.'.$file->guessExtension(), 'local');
        $w = imagesx($image);
        $h = imagesy($image);
        $ratio = min(1, 600 / max($w, $h));
        $thumb = imagecreatetruecolor(max(1, (int) ($w * $ratio)), max(1, (int) ($h * $ratio)));
        $white = imagecolorallocate($thumb, 250, 248, 246);
        imagefill($thumb, 0, 0, $white);
        imagecopyresampled($thumb, $image, 0, 0, 0, 0, imagesx($thumb), imagesy($thumb), $w, $h);
        ob_start();
        imagejpeg($thumb, null, 85);
        $bytes = ob_get_clean();
        Storage::disk('local')->put('products/'.$key.'-thumb.jpg', $bytes);
        imagedestroy($image);
        imagedestroy($thumb);
        $img = DB::table('images')->insertGetId(['product_id' => $id, 'path' => $path, 'thumb' => 'products/'.$key.'-thumb.jpg', 'alt' => $r->input('alt') ?: DB::table('products')->where('id', $id)->value('name'), 'position' => DB::table('images')->where('product_id', $id)->count(), 'created_at' => now(), 'updated_at' => now()]);
        $this->audit('image.upload', 'product:'.$id);

        return ['id' => $img];
    }

    public function image(Request $r, int $id)
    {
        $i = DB::table('images')->find($id);
        abort_unless($i, 404);

        return Storage::disk('local')->response($r->boolean('original') ? $i->path : $i->thumb, null, ['X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, max-age=3600']);
    }

    public function imageAction(Request $r, int $id)
    {
        $this->allow(['manager', 'warehouse']);
        $i = DB::table('images')->find($id);
        abort_unless($i, 404);
        if ($r->input('action') === 'cover') {
            DB::transaction(function () use ($i, $id) {
                DB::table('images')->where('product_id', $i->product_id)->increment('position');
                DB::table('images')->where('id', $id)->update(['position' => 0]);
            });
        } elseif ($r->input('action') === 'delete') {
            Storage::disk('local')->delete([$i->path, $i->thumb]);
            DB::table('images')->where('id', $id)->delete();
        } else {
            Documents::fail(__('Unknown image action.'));
        }

        return ['ok' => true];
    }

    /**
     * Import inspiration references from a CSV file.
     */
    public function importReferences(Request $r)
    {
        $this->allow(['manager', 'warehouse']);
        $r->validate(['file' => 'required|file|max:2048|mimes:csv,txt', 'update' => 'sometimes|boolean']);
        $result = ReferenceLibrary::import($r->file('file')->getRealPath(), $r->boolean('update'));
        $this->audit('references.import', 'library', ['added' => $result['added'], 'updated' => $result['updated'], 'skipped' => $result['skipped'], 'errors' => count($result['errors'])]);

        return $result;
    }

    /**
     * Download the library (or an empty template) as CSV.
     */
    public function exportReferences(Request $r)
    {
        $this->allow(['manager', 'warehouse', 'production']);
        $template = $r->boolean('template');

        return response(ReferenceLibrary::csv($template), 200, ['Content-Type' => 'text/csv; charset=UTF-8', 'Content-Disposition' => 'attachment; filename="'.($template ? 'inspiration-template' : 'inspiration-library-'.date('Y-m-d')).'.csv"']);
    }

    /**
     * Give every active stocked product without a barcode an in-store EAN-13 (prefix 20, reserved for
     * internal use): 20 + product id padded to 10 digits + check digit.
     */
    public function generateBarcodes()
    {
        $this->allow(['manager', 'warehouse']);
        $assigned = [];
        foreach (DB::table('products')->where('active', true)->where(fn ($q) => $q->whereNull('barcode')->orWhere('barcode', ''))->orderBy('id')->get(['id', 'name']) as $product) {
            $code = self::ean13('20'.str_pad((string) $product->id, 10, '0', STR_PAD_LEFT));
            if (DB::table('products')->where('barcode', $code)->exists()) {
                continue;
            }
            DB::table('products')->where('id', $product->id)->update(['barcode' => $code, 'updated_at' => now()]);
            $assigned[] = ['id' => $product->id, 'name' => $product->name, 'barcode' => $code];
        }
        $this->audit('products.barcodes', 'catalogue', ['assigned' => count($assigned)]);

        return ['assigned' => $assigned];
    }

    /**
     * Append the EAN-13 check digit to 12 digits.
     */
    public static function ean13(string $twelve): string
    {
        $sum = 0;
        foreach (str_split($twelve) as $i => $digit) {
            $sum += (int) $digit * ($i % 2 ? 3 : 1);
        }

        return $twelve.((10 - $sum % 10) % 10);
    }
}
