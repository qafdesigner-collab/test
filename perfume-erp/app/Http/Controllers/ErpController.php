<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use App\Services\Costing;
use App\Services\Documents;
use App\Services\Dossiers;
use App\Services\Production;
use App\Services\Profitability;
use App\Services\Stock;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ErpController extends Controller
{
    const ROLES = ['owner', 'manager', 'warehouse', 'production', 'cashier', 'designer', 'accountant'];

    private function allow(array $roles): void
    {
        abort_unless(Auth::check() && Auth::user()->active && in_array(Auth::user()->role, array_merge(['owner'], $roles)), 403, 'You do not have permission for this action.');
    }

    private function audit(string $action, string $subject, array $details = []): void
    {
        DB::table('audit')->insert(['user_id' => Auth::id(), 'action' => $action, 'subject' => $subject, 'details' => json_encode($details), 'created_at' => now()]);
    }

    public function login(Request $r)
    {
        $v = $r->validate(['email' => 'required|email', 'password' => 'required|string']);
        $key = 'login:'.$r->ip().':'.strtolower($v['email']);
        if (RateLimiter::tooManyAttempts($key, 6)) {
            throw ValidationException::withMessages(['email' => 'Too many attempts. Try again in a minute.']);
        }if (! Auth::attempt($v + ['active' => true])) {
            RateLimiter::hit($key, 60);
            throw ValidationException::withMessages(['email' => 'Email or password is incorrect.']);
        }RateLimiter::clear($key);
        $r->session()->regenerate();
        $this->audit('auth.login', 'user:'.Auth::id());

        return redirect('/');
    }

    public function logout(Request $r)
    {
        Auth::logout();
        $r->session()->invalidate();
        $r->session()->regenerateToken();

        return redirect('/login');
    }

    public function bootstrap()
    {
        abort_unless(Auth::user()->active, 403);
        $user = Auth::user();

        return ['user' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'role' => $user->role], 'settings' => DB::table('settings')->pluck('value', 'key'), 'locations' => DB::table('locations')->get(), 'csrf' => csrf_token(), 'build' => '0.1.0-development', 'capabilities' => ['hybrid_sync' => false, 'uae_einvoice' => false, 'full_accounting' => false, 'arabic' => false, 'terminal_integration' => false]];
    }

    public function dashboard()
    {
        $this->allow(['manager', 'accountant', 'warehouse', 'production', 'cashier', 'designer']);
        $finance = in_array(Auth::user()->role, ['owner', 'manager', 'accountant']);
        $sales = DB::table('documents')->whereIn('kind', ['Sale', 'Invoice'])->where('status', 'Posted');
        $stock = DB::table('products as p')->leftJoin('balances as b', 'p.id', '=', 'b.product_id')->where('p.active', true)->where('p.kind', '!=', 'service')->groupBy('p.id')->select('p.id', 'p.name', 'p.sku', 'p.unit', 'p.reorder_milli')->selectRaw('COALESCE(SUM(b.quantity_milli),0) as stock')->get();
        $trend = DB::table('documents')->whereIn('kind', ['Sale', 'Invoice'])->where('status', 'Posted')->where('created_at', '>=', now()->subDays(6)->startOfDay())->selectRaw('DATE(created_at) as day,SUM(total_cents) as total')->groupByRaw('DATE(created_at)')->get();

        return ['products' => DB::table('products')->where('active', true)->count(), 'revenue_cents' => $finance ? (clone $sales)->sum('total_cents') : null, 'outstanding_cents' => $finance ? (clone $sales)->selectRaw('COALESCE(SUM(total_cents-paid_cents),0) as n')->value('n') : null, 'production' => DB::table('batches')->where('status', '!=', 'Completed')->count(), 'projects' => DB::table('projects')->where('status', '!=', 'Delivered')->count(), 'low_stock' => $stock->filter(fn ($p) => $p->stock <= $p->reorder_milli)->values(), 'recent' => ($finance ? DB::table('documents') : DB::table('documents')->where('user_id', Auth::id()))->orderByDesc('id')->limit(6)->get(), 'trend' => $finance ? $trend : [], 'batches' => DB::table('batches as b')->join('formulas as f', 'f.id', '=', 'b.formula_id')->select('b.number', 'b.planned', 'b.status', 'f.name as formula_name')->orderByDesc('b.id')->limit(5)->get()];
    }

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
        $v = $r->validate(['sku' => ['required', 'string', 'max:60', Rule::unique('products')->ignore($id)], 'name' => 'required|string|max:150', 'kind' => ['required', Rule::in(['finished', 'raw', 'packaging', 'resale', 'service', 'intermediate'])], 'unit' => ['required', Rule::in(['ml', 'litre', 'g', 'kg', 'piece', 'bottle', 'box', 'carton', 'hour'])], 'barcode' => ['nullable', 'string', 'max:80', Rule::unique('products')->ignore($id)], 'price' => 'required', 'cost' => 'required', 'tax' => 'required', 'reorder' => 'required', 'families' => 'present|array|max:20', 'families.*' => 'string|max:50', 'notes' => 'present|array|max:30', 'notes.*' => 'string|max:80', 'tags' => 'present|array|max:30', 'tags.*' => 'string|max:50', 'style' => 'nullable|string|max:60', 'origin' => 'nullable|string|max:60', 'audience' => 'nullable|string|max:60', 'concentration' => 'nullable|string|max:40', 'size' => 'nullable|string|max:40', 'description' => 'nullable|string|max:4000', 'reference_id' => 'nullable|exists:references,id', 'active' => 'required|boolean', 'sales_allowed' => 'sometimes|boolean', 'fragrance_profile' => 'sometimes|array:top_notes,heart_notes,base_notes,smell_description,intensity,longevity,projection,season,occasion', 'fragrance_profile.top_notes' => 'sometimes|array|max:30', 'fragrance_profile.heart_notes' => 'sometimes|array|max:30', 'fragrance_profile.base_notes' => 'sometimes|array|max:30', 'fragrance_profile.top_notes.*' => 'string|max:80', 'fragrance_profile.heart_notes.*' => 'string|max:80', 'fragrance_profile.base_notes.*' => 'string|max:80', 'fragrance_profile.smell_description' => 'sometimes|nullable|string|max:2000', 'fragrance_profile.intensity' => 'sometimes|nullable|string|max:150', 'fragrance_profile.longevity' => 'sometimes|nullable|string|max:150', 'fragrance_profile.projection' => 'sometimes|nullable|string|max:150', 'fragrance_profile.season' => 'sometimes|nullable|string|max:150', 'fragrance_profile.occasion' => 'sometimes|nullable|string|max:150']);
        if (isset($v['fragrance_profile'])) {
            $v['fragrance_profile'] = json_encode($v['fragrance_profile']);
        }
        $v['sales_allowed'] = $v['sales_allowed'] ?? ($id ? (bool) DB::table('products')->where('id', $id)->value('sales_allowed') : in_array($v['kind'], ['finished', 'resale', 'service']));
        $v['price_cents'] = Amounts::parse($v['price']);
        $v['cost_cents'] = Amounts::parse($v['cost']);
        $v['tax_bp'] = Amounts::parse($v['tax']);
        $v['reorder_milli'] = Amounts::parse($v['reorder'], 3);
        if ($v['price_cents'] > 10000000 || $v['cost_cents'] > 10000000) {
            Documents::fail('Price or cost cannot exceed 100,000 per base unit.');
        }if ($v['tax_bp'] > 10000) {
            Documents::fail('Tax percentage cannot exceed 100.');
        }unset($v['price'],$v['cost'],$v['tax'],$v['reorder']);
        foreach (['families', 'notes', 'tags'] as $k) {
            $v[$k] = json_encode(array_values(array_unique($v[$k])));
        }$v['barcode'] = $v['barcode'] ?? null;
        $v['updated_at'] = now();
        if ($id) {
            abort_unless(DB::table('products')->where('id', $id)->exists(), 404);
            $old = DB::table('products')->find($id);
            if (($old->unit !== $v['unit'] || $old->kind !== $v['kind']) && (DB::table('movements')->where('product_id', $id)->exists() || DB::table('document_lines')->where('product_id', $id)->exists() || DB::table('formulas')->exists())) {
                Documents::fail('Unit/type cannot change after operational use. Create a new SKU.');
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
            $v = $r->validate(['brand' => 'required|string|max:100', 'name' => 'required|string|max:150', 'notes' => 'nullable|string|max:2000']);
            $id = DB::table('references')->insertGetId($v + ['created_at' => now(), 'updated_at' => now()]);

            return ['id' => $id];
        }

        return ['references' => DB::table('references')->orderBy('brand')->get()];
    }

    public function uploadImage(Request $r, int $id)
    {
        $this->allow(['manager', 'warehouse']);
        abort_unless(DB::table('products')->where('id', $id)->exists(), 404);
        $r->validate(['image' => 'required|image|mimes:jpg,jpeg,png,webp|max:8192|dimensions:max_width=4096,max_height=4096', 'alt' => 'nullable|string|max:180']);
        if (DB::table('images')->where('product_id', $id)->count() >= 12) {
            Documents::fail('Maximum 12 images per product.');
        }$file = $r->file('image');
        $raw = file_get_contents($file->getRealPath());
        $image = @imagecreatefromstring($raw);
        if (! $image) {
            Documents::fail('Image cannot be decoded.');
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
            Documents::fail('Unknown image action.');
        }

        return ['ok' => true];
    }

    public function contacts(Request $r)
    {
        $this->allow(['manager', 'warehouse', 'accountant', 'cashier', 'designer']);
        if ($r->isMethod('post')) {
            $this->allow(['manager', 'warehouse', 'accountant']);
            $v = $r->validate(['name' => 'required|string|max:150', 'kind' => ['required', Rule::in(['customer', 'supplier'])], 'email' => 'nullable|email|max:150', 'phone' => 'nullable|string|max:40', 'address' => 'nullable|string|max:1000', 'tax_id' => 'nullable|string|max:50', 'credit' => 'required', 'terms_days' => 'required|integer|min:0|max:365']);
            $v['credit_cents'] = Amounts::parse($v['credit']);
            unset($v['credit']);

            return ['id' => DB::table('contacts')->insertGetId($v + ['created_at' => now(), 'updated_at' => now()])];
        }

        return ['contacts' => DB::table('contacts')->orderBy('name')->get()];
    }

    public function inventory()
    {
        $this->allow(['manager', 'warehouse', 'production', 'accountant']);

        return ['balances' => DB::table('balances as b')->join('products as p', 'p.id', '=', 'b.product_id')->join('locations as l', 'l.id', '=', 'b.location_id')->select('b.*', 'p.name', 'p.sku', 'p.unit', 'l.name as location')->orderBy('p.name')->get(), 'movements' => DB::table('movements as m')->join('products as p', 'p.id', '=', 'm.product_id')->join('locations as l', 'l.id', '=', 'm.location_id')->select('m.*', 'p.name', 'p.unit', 'l.name as location')->orderByDesc('m.id')->limit(150)->get()];
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

    private function once(Request $r, string $action, callable $fn): array
    {
        $key = $r->header('Idempotency-Key');
        if (! $key || ! Str::isUuid($key)) {
            Documents::fail('A unique request identifier is required.');
        }$fingerprint = hash('sha256', json_encode($r->except('_token')));

        return DB::transaction(function () use ($key, $action, $fingerprint, $fn) {
            $prior = DB::table('idempotency')->where('key', $key)->first();
            if ($prior) {
                abort_unless($prior->user_id === Auth::id() && $prior->action === $action && $prior->fingerprint === $fingerprint, 409, 'Request identifier was already used.');

                return json_decode($prior->result, true);
            }$result = $fn();
            DB::table('idempotency')->insert(['key' => $key, 'user_id' => Auth::id(), 'action' => $action, 'fingerprint' => $fingerprint, 'result' => json_encode($result), 'created_at' => now()]);

            return $result;
        }, 3);
    }

    public function documents(Request $r)
    {
        $this->allow(['manager', 'accountant', 'cashier', 'warehouse']);
        $q = DB::table('documents as d')->leftJoin('contacts as c', 'c.id', '=', 'd.contact_id')->select('d.*', 'c.name as contact');
        if (Auth::user()->role === 'cashier') {
            $q->where('d.user_id', Auth::id());
        }if ($r->filled('kind')) {
            $q->where('d.kind', $r->string('kind'));
        }

        return ['documents' => $q->orderByDesc('d.id')->limit(300)->get()];
    }

    public function document(int $id)
    {
        $this->allow(['manager', 'accountant', 'cashier', 'warehouse']);
        $d = DB::table('documents')->find($id);
        abort_unless($d, 404);
        if (Auth::user()->role === 'cashier') {
            abort_unless($d->user_id === Auth::id(), 403);
        }

        $lines = DB::table('document_lines')->where('document_id', $id)->get();
        $finance = in_array(Auth::user()->role, ['owner', 'manager', 'accountant']);
        foreach ($lines as $line) {
            if (! $finance) {
                unset($line->cogs_cents,$line->cost_allocations);
            } else {
                $line->cost_allocations = $line->cost_allocations ? json_decode($line->cost_allocations, true) : null;
            }
        }

        return ['document' => $d, 'lines' => $lines, 'profit' => $finance ? Profitability::document($d, $lines) : null, 'payments' => DB::table('payments')->where('document_id', $id)->get(), 'contact' => $d->contact_snapshot ? json_decode($d->contact_snapshot, true) : ($d->contact_id ? DB::table('contacts')->find($d->contact_id) : null)];
    }

    public function createDocument(Request $r)
    {
        $this->allow(['manager', 'accountant', 'cashier', 'warehouse']);
        $v = $r->validate(['kind' => ['required', Rule::in(['Sale', 'Invoice', 'Quotation', 'Purchase'])], 'contact_id' => 'nullable|exists:contacts,id', 'location_id' => 'required|exists:locations,id', 'method' => ['required', Rule::in(['Cash', 'Card', 'Bank', 'Credit'])], 'paid' => 'required', 'notes' => 'nullable|string|max:3000', 'bill_reference' => 'nullable|string|max:100', 'due_date' => 'nullable|date_format:Y-m-d', 'lines' => 'required|array|min:1|max:100', 'lines.*.product_id' => 'required|exists:products,id', 'lines.*.quantity' => 'required', 'lines.*.price' => 'nullable', 'lines.*.discount' => 'nullable']);
        if ($v['kind'] === 'Purchase') {
            $this->allow(['manager', 'warehouse', 'accountant']);
        }if ($v['kind'] !== 'Sale') {
            $this->allow(['manager', 'accountant', 'warehouse']);
        }if (Auth::user()->role === 'cashier') {
            foreach ($v['lines'] as $l) {
                $p = DB::table('products')->find($l['product_id']);
                if (isset($l['price']) && Amounts::parse($l['price']) !== $p->price_cents) {
                    abort(403, 'Cashiers cannot override prices.');
                }if (Amounts::parse($l['discount'] ?? '0') > 0) {
                    abort(403, 'Discount approval is required.');
                }
            }
        }

        return $this->once($r, 'document.create', fn () => Documents::create($v, Auth::id()));
    }

    public function documentAction(Request $r, int $id)
    {
        $this->allow(['manager', 'accountant']);
        $action = $r->input('action');
        if ($action === 'payment') {
            $r->validate(['amount' => 'required', 'method' => ['required', Rule::in(['Cash', 'Card', 'Bank'])]]);

            return $this->once($r, 'payment', fn () => Documents::payment($id, Amounts::parse($r->input('amount')), $r->input('method'), Auth::id()));
        }if ($action === 'return') {
            $r->validate(['condition' => ['required', Rule::in(['Restock', 'Do not restock'])]]);

            return $this->once($r, 'return', fn () => Documents::returnSale($id, $r->input('condition'), Auth::id()));
        }if (in_array($action, ['accept', 'decline'])) {
            return DB::transaction(function () use ($id, $action) {
                $doc = DB::table('documents')->where('id', $id)->lockForUpdate()->first();
                if (! $doc || $doc->kind !== 'Quotation' || $doc->status !== 'Draft') {
                    Documents::fail('Only a draft quotation can be approved or declined.');
                }DB::table('documents')->where('id', $id)->update(['status' => $action === 'accept' ? 'Accepted' : 'Declined', 'updated_at' => now()]);
                $this->audit('quotation.'.$action, $doc->number);

                return ['ok' => true];
            });
        }Documents::fail('Unknown document action.');
    }

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
            Documents::fail('Formula output must be a finished bottle/piece product.');
        }foreach (['ingredients', 'packaging'] as $key) {
            $rows = [];
            foreach ($v[$key] as $i) {
                $material = DB::table('products')->find($i['product_id']);
                if ($key === 'ingredients' && ! in_array($material->kind, ['raw', 'intermediate'])) {
                    Documents::fail('Ingredients must be raw or intermediate products.');
                }if ($key === 'packaging' && $material->kind !== 'packaging') {
                    Documents::fail('Packaging rows must use packaging products.');
                }$q = Amounts::parse($i['quantity'], 3);
                if ($q <= 0 || $q > 100000) {
                    Documents::fail('Per-bottle material quantity must be positive and no more than 100 base units.');
                }if (in_array($material->unit, ['piece', 'bottle', 'box', 'carton']) && $q % 1000) {
                    Documents::fail('Packaging/count units must be whole numbers.');
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
                Documents::fail('Approve the formula first.');
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

    public function projects(Request $r)
    {
        $this->allow(['manager', 'designer']);
        if ($r->isMethod('post')) {
            $v = $r->validate(['name' => 'required|string|max:150', 'contact_id' => 'nullable|exists:contacts,id', 'type' => ['required', Rule::in(['Design', 'Printing', 'Packaging', 'Private Label'])], 'brief' => 'required|string|max:6000', 'due_date' => 'nullable|date', 'assigned_id' => 'nullable|exists:users,id', 'charge' => 'required', 'cost' => 'required', 'specification' => 'nullable|string|max:3000', 'product_id' => 'nullable|exists:products,id', 'batch_id' => 'nullable|exists:batches,id', 'supplier_id' => 'nullable|exists:contacts,id']);
            if (Auth::user()->role === 'designer' && (Amounts::parse($v['charge']) || Amounts::parse($v['cost']))) {
                abort(403, 'Managers set financial charges.');
            }if (! empty($v['contact_id']) && DB::table('contacts')->where('id', $v['contact_id'])->value('kind') !== 'customer') {
                Documents::fail('Choose a customer.');
            }
            if (! empty($v['supplier_id']) && DB::table('contacts')->where('id', $v['supplier_id'])->value('kind') !== 'supplier') {
                Documents::fail('Choose a supplier.');
            }
            if (! empty($v['batch_id']) && DB::table('batches as b')->join('formulas as f', 'f.id', '=', 'b.formula_id')->where('b.id', $v['batch_id'])->value('f.product_id') != ($v['product_id'] ?? null)) {
                Documents::fail('Batch must produce the selected product.');
            }
            $v['charge_cents'] = Amounts::parse($v['charge']);
            $v['cost_cents'] = Amounts::parse($v['cost']);
            unset($v['charge'],$v['cost']);

            return ['id' => DB::table('projects')->insertGetId($v + ['user_id' => Auth::id(), 'created_at' => now(), 'updated_at' => now()])];
        }$q = DB::table('projects as p')->leftJoin('contacts as c', 'c.id', '=', 'p.contact_id')->leftJoin('users as u', 'u.id', '=', 'p.assigned_id')->select('p.*', 'c.name as customer', 'u.name as designer');
        if (Auth::user()->role === 'designer') {
            $q->where(function ($x) {
                $x->where('p.assigned_id', Auth::id())->orWhere('p.user_id', Auth::id());
            });
        }$projects = $q->orderByDesc('p.id')->get();
        foreach ($projects as $p) {
            $p->artworks = DB::table('artworks')->where('project_id', $p->id)->orderByDesc('version')->get();
            $p->approvals = DB::table('approvals')->where('project_id', $p->id)->get();
            if (Auth::user()->role === 'designer') {
                unset($p->charge_cents,$p->cost_cents);
            }
        }

        return ['projects' => $projects];
    }

    private function projectAccess(int $id): object
    {
        $p = DB::table('projects')->find($id);
        abort_unless($p, 404);
        if (Auth::user()->role === 'designer') {
            abort_unless($p->assigned_id === Auth::id() || $p->user_id === Auth::id(), 403);
        }

        return $p;
    }

    public function uploadArtwork(Request $r, int $id)
    {
        $this->allow(['manager', 'designer']);
        $p = $this->projectAccess($id);
        if ($p->status === 'Delivered') {
            Documents::fail('Delivered projects cannot receive revisions.');
        }$r->validate(['file' => 'required|file|mimes:pdf,png,jpg,jpeg,webp|max:16384', 'comment' => 'nullable|string|max:2000']);
        $f = $r->file('file');
        $path = $f->store('artwork', 'local');

        return DB::transaction(function () use ($id, $r, $f, $path, $p) {
            $p = DB::table('projects')->where('id', $id)->lockForUpdate()->first();
            abort_if($p->status === 'Delivered', 422, 'Delivered projects are locked.');
            $version = 1 + (int) DB::table('artworks')->where('project_id', $id)->max('version');
            $aid = DB::table('artworks')->insertGetId(['project_id' => $id, 'version' => $version, 'path' => $path, 'filename' => basename($f->getClientOriginalName()), 'mime' => $f->getMimeType(), 'comment' => $r->input('comment'), 'user_id' => Auth::id(), 'created_at' => now(), 'updated_at' => now()]);
            DB::table('projects')->where('id', $id)->update(['status' => 'Review', 'approved_artwork_id' => null, 'workflow_events' => json_encode(array_map(fn ($e) => $e['stage'] === 'packaging_ready' ? array_merge($e, ['stage' => 'packaging_superseded']) : $e, json_decode($p->workflow_events ?? '[]', true))), 'updated_at' => now()]);

            return ['id' => $aid];
        });
    }

    public function artwork(int $id)
    {
        $this->allow(['manager', 'designer']);
        $a = DB::table('artworks')->find($id);
        abort_unless($a, 404);
        $this->projectAccess($a->project_id);

        return Storage::disk('local')->download($a->path, $a->filename, ['X-Content-Type-Options' => 'nosniff']);
    }

    public function projectAction(Request $r, int $id)
    {
        $this->allow(['manager']);
        $p = $this->projectAccess($id);
        $v = $r->validate(['action' => ['required', Rule::in(['approve', 'revise', 'deliver'])], 'artwork_id' => 'nullable|integer', 'comment' => 'required|string|max:2000']);

        return DB::transaction(function () use ($v, $id) {
            $p = DB::table('projects')->where('id', $id)->lockForUpdate()->first();
            if ($v['action'] === 'deliver') {
                if ($p->status !== 'Approved' || ! $p->approved_artwork_id) {
                    Documents::fail('Approve the artwork before delivery.');
                }DB::table('projects')->where('id', $id)->update(['status' => 'Delivered', 'updated_at' => now()]);
            } else {
                $a = DB::table('artworks')->where(['id' => $v['artwork_id'] ?? 0, 'project_id' => $id])->first();
                if (! $a || $a->version !== DB::table('artworks')->where('project_id', $id)->max('version')) {
                    Documents::fail('Review the latest artwork version.');
                }if ($p->status === 'Delivered') {
                    Documents::fail('Delivered project is locked.');
                }DB::table('approvals')->insert(['project_id' => $id, 'artwork_id' => $a->id, 'user_id' => Auth::id(), 'decision' => $v['action'], 'comment' => $v['comment'], 'created_at' => now()]);
                DB::table('projects')->where('id', $id)->update(['status' => $v['action'] === 'approve' ? 'Approved' : 'Revision', 'approved_artwork_id' => $v['action'] === 'approve' ? $a->id : null, 'updated_at' => now()]);
            }$this->audit('project.'.$v['action'], 'project:'.$id);

            return ['ok' => true];
        });
    }

    public function shifts(Request $r)
    {
        $this->allow(['manager', 'cashier']);
        if ($r->isMethod('post')) {
            $v = $r->validate(['action' => ['required', Rule::in(['open', 'close'])], 'amount' => 'required']);
            $amount = Amounts::parse($v['amount']);

            return $this->once($r, 'shift', function () use ($v, $amount) {
                $shift = DB::table('shifts')->where('user_id', Auth::id())->whereNull('closed_at')->lockForUpdate()->first();
                if ($v['action'] === 'open') {
                    if ($shift) {
                        Documents::fail('You already have an open shift.');
                    }$id = DB::table('shifts')->insertGetId(['user_id' => Auth::id(), 'opening_cents' => $amount, 'opened_at' => now()]);

                    return ['id' => $id];
                }if (! $shift) {
                    Documents::fail('No open shift.');
                }$cash = $this->shiftCash($shift);
                DB::table('shifts')->where('id', $shift->id)->update(['counted_cents' => $amount, 'variance_cents' => $amount - ($shift->opening_cents + $cash), 'closed_at' => now()]);

                return ['id' => $shift->id, 'variance_cents' => $amount - ($shift->opening_cents + $cash)];
            });
        }$rows = DB::table('shifts')->where('user_id', Auth::id())->orderByDesc('id')->limit(20)->get();
        foreach ($rows as $s) {
            $s->expected_cents = $s->opening_cents + $this->shiftCash($s);
        }

        return ['shifts' => $rows];
    }

    private function shiftCash(object $s): int
    {
        $end = $s->closed_at ?? now();
        $received = DB::table('payments')->where('user_id', $s->user_id)->where('method', 'Cash')->whereBetween('created_at', [$s->opened_at, $end])->whereIn('document_id', DB::table('documents')->whereIn('kind', ['Sale', 'Invoice'])->select('id'))->sum('amount_cents');
        $refunds = DB::table('documents')->where('user_id', $s->user_id)->where('kind', 'Return')->where('method', 'Cash')->whereBetween('created_at', [$s->opened_at, $end])->sum('paid_cents');

        return $received - $refunds;
    }

    public function settings(Request $r)
    {
        $this->allow(['manager']);
        if ($r->isMethod('post')) {
            $v = $r->validate(['company_name' => 'required|string|max:150', 'address' => 'nullable|string|max:2000', 'phone' => 'nullable|string|max:50', 'email' => 'nullable|email|max:150', 'tax_id' => 'nullable|string|max:50', 'currency' => 'required|string|size:3']);
            foreach ($v as $k => $val) {
                DB::table('settings')->updateOrInsert(['key' => $k], ['value' => $val ?? '']);
            }$this->audit('settings.update', 'company');

            return ['ok' => true];
        }

        return ['settings' => DB::table('settings')->pluck('value', 'key')];
    }

    public function users(Request $r)
    {
        $this->allow([]);
        if ($r->isMethod('post')) {
            $v = $r->validate(['name' => 'required|string|max:100', 'email' => 'required|email|max:150|unique:users,email', 'password' => 'required|string|min:12|max:128', 'role' => ['required', Rule::in(self::ROLES)]]);
            $id = DB::table('users')->insertGetId(['name' => $v['name'], 'email' => $v['email'], 'password' => Hash::make($v['password']), 'role' => $v['role'], 'active' => true, 'created_at' => now(), 'updated_at' => now()]);
            $this->audit('user.create', 'user:'.$id);

            return ['id' => $id];
        }

        return ['users' => DB::table('users')->select('id', 'name', 'email', 'role', 'active')->get()];
    }

    public function password(Request $r)
    {
        $v = $r->validate(['current_password' => 'required|current_password', 'password' => 'required|string|min:12|max:128|confirmed']);
        Auth::user()->forceFill(['password' => Hash::make($v['password'])])->save();
        $r->session()->regenerate();
        $this->audit('user.password', 'user:'.Auth::id());

        return ['ok' => true];
    }

    public function auditLog()
    {
        $this->allow(['manager']);

        return ['audit' => DB::table('audit as a')->leftJoin('users as u', 'a.user_id', '=', 'u.id')->select('a.id', 'a.action', 'a.subject', 'a.created_at', 'u.name as user')->orderByDesc('a.id')->limit(300)->get()];
    }

    public function projectLinks(Request $r, int $id): array
    {
        $this->allow(['manager']);
        $v = $r->validate(['contact_id' => 'nullable|exists:contacts,id', 'product_id' => 'nullable|exists:products,id', 'batch_id' => 'nullable|exists:batches,id', 'supplier_id' => 'nullable|exists:contacts,id']);
        $p = DB::table('projects')->find($id);
        abort_unless($p, 404);
        if ($p->workflow_events && array_filter(json_decode($p->workflow_events, true), fn ($e) => $e['stage'] === 'vendor_started') && ($v['supplier_id'] ?? null) != $p->supplier_id) {
            Documents::fail('Vendor is locked after work starts.');
        }if ($p->status === 'Delivered') {
            Documents::fail('Delivered links are locked.');
        }if (! empty($v['contact_id']) && DB::table('contacts')->where('id', $v['contact_id'])->value('kind') !== 'customer') {
            Documents::fail('Choose a customer.');
        }if (! empty($v['supplier_id']) && DB::table('contacts')->where('id', $v['supplier_id'])->value('kind') !== 'supplier') {
            Documents::fail('Choose a supplier.');
        }if (! empty($v['batch_id']) && DB::table('batches as b')->join('formulas as f', 'f.id', '=', 'b.formula_id')->where('b.id', $v['batch_id'])->value('f.product_id') != ($v['product_id'] ?? null)) {
            Documents::fail('The batch must produce the selected product.');
        }DB::table('projects')->where('id', $id)->update($v + ['updated_at' => now()]);
        $this->audit('project.links', $id);

        return ['ok' => true];
    }

    public function customerDossier(int $id): array
    {
        $this->allow(['manager']);

        return Dossiers::customer($id);
    }

    public function productDossier(int $id): array
    {
        $this->allow(['manager']);

        return Dossiers::product($id);
    }

    public function projectWorkflow(Request $r, int $id): array
    {
        $this->allow(['manager']);
        $v = $r->validate(['stage' => ['required', Rule::in(['vendor_started', 'vendor_finished', 'packaging_ready', 'delivered'])], 'notes' => 'required|string|max:3000', 'performed_at' => 'nullable|date']);

        return $this->once($r, 'project.workflow', function () use ($id, $v) {
            $p = DB::table('projects')->where('id', $id)->lockForUpdate()->first();
            abort_unless($p, 404);
            $events = json_decode($p->workflow_events ?? '[]', true);
            $stages = array_column($events, 'stage');
            if (in_array($v['stage'], $stages)) {
                Documents::fail('This stage is already recorded.');
            }if (in_array('delivered', $stages)) {
                Documents::fail('Delivered workflow is locked.');
            }if ($v['stage'] === 'vendor_started' && ! $p->supplier_id) {
                Documents::fail('Link a supplier to this project first.');
            }if ($v['stage'] === 'vendor_finished' && ! in_array('vendor_started', $stages)) {
                Documents::fail('Record vendor start first.');
            }if ($v['stage'] === 'packaging_ready' && ! $p->approved_artwork_id) {
                Documents::fail('Approve the artwork before marking packaging ready.');
            }if ($v['stage'] === 'delivered') {
                if (! in_array('packaging_ready', $stages)) {
                    Documents::fail('Record packaging readiness first.');
                }if ($p->batch_id && DB::table('batches')->where('id', $p->batch_id)->value('status') !== 'Completed') {
                    Documents::fail('Complete the linked production batch before delivery.');
                }
            }$at = ! empty($v['performed_at']) ? Carbon::parse($v['performed_at']) : now();
            if ($at->gt(now())) {
                Documents::fail('Stage completion cannot be in the future.');
            }if ($v['stage'] === 'vendor_finished') {
                foreach ($events as $event) {
                    if ($event['stage'] === 'vendor_started' && $at->lt(Carbon::parse($event['at']))) {
                        Documents::fail('Vendor completion cannot be before vendor start.');
                    }
                }
            }$events[] = ['stage' => $v['stage'], 'at' => $at->toIso8601String(), 'recorded_at' => now()->toIso8601String(), 'notes' => $v['notes']];
            DB::table('projects')->where('id', $id)->update(['workflow_events' => json_encode($events), 'status' => $v['stage'] === 'delivered' ? 'Delivered' : $p->status, 'updated_at' => now()]);
            $this->audit('project.workflow', $id);

            return ['ok' => true];
        });
    }

    public function profitability(): array
    {
        $this->allow(['manager', 'accountant']);

        return Profitability::report();
    }

    public function export(Request $r)
    {
        $this->allow(['manager', 'accountant']);
        $kind = $r->input('type', 'sales');
        $rows = $kind === 'profit' ? collect(Profitability::report()['products'])->map(fn ($r) => (object) $r) : ($kind === 'stock' ? $this->inventory()['balances'] : DB::table('documents')->orderBy('id')->get());

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            if (count($rows)) {
                fputcsv($out, array_keys((array) $rows[0]));
                foreach ($rows as $row) {
                    fputcsv($out, array_map(function ($v) {
                        $s = (string) $v;

                        return preg_match('/^[=+@\t\r-]/', $s) ? "'".$s : $s;
                    }, (array) $row));
                }
            }fclose($out);
        }, 'perfume-'.$kind.'-'.date('Y-m-d').'.csv', ['Content-Type' => 'text/csv']);
    }

    public function staff()
    {
        $this->allow(['manager', 'designer']);

        return ['staff' => DB::table('users')->where('active', true)->select('id', 'name', 'role')->get()];
    }

    public function locations(Request $r)
    {
        $this->allow(['manager']);
        $v = $r->validate(['name' => 'required|string|max:100|unique:locations,name', 'kind' => ['required', Rule::in(['warehouse', 'shop'])]]);
        $id = DB::table('locations')->insertGetId($v + ['created_at' => now(), 'updated_at' => now()]);
        $this->audit('location.create', 'location:'.$id);

        return ['id' => $id];
    }

    public function userAction(Request $r, int $id)
    {
        $this->allow([]);
        $v = $r->validate(['active' => 'required|boolean', 'sales_allowed' => 'sometimes|boolean']);
        if ($id === Auth::id()) {
            Documents::fail('You cannot disable your own account.');
        }abort_unless(DB::table('users')->where('id', $id)->exists(), 404);
        DB::table('users')->where('id', $id)->update(['active' => $v['active'], 'updated_at' => now()]);
        $this->audit('user.status', 'user:'.$id);

        return ['ok' => true];
    }
}
