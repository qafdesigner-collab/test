<?php

namespace Database\Seeders;

use App\Http\Controllers\CatalogueController;
use App\Http\Controllers\ContactController;
use App\Http\Controllers\DesignProjectController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\ManufacturingController;
use App\Http\Controllers\ShiftController;
use App\Models\User;
use App\Services\Amounts;
use App\Services\Documents;
use App\Services\Stock;
use Illuminate\Database\Seeder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * A complete fictional perfume business: 90 days of purchases, production, POS and wholesale sales,
 * quotations, payments, returns, expenses, shifts, loyalty and design projects. Everything is posted
 * through the application's own controllers and services, signed in as the owner, so stock, costs,
 * balances and reports agree. Runs only on an installation without sales or purchases.
 */
class DemoBusinessSeeder extends Seeder
{
    private const DAYS = 90;

    private User $owner;

    private Carbon $realNow;

    /** @var array<string, int> product id by SKU */
    private array $sku = [];

    /** @var array<string, int> contact id by short key */
    private array $contact = [];

    /** @var list<array{id: int, due: string}> invoices to collect later */
    private array $receivables = [];

    /** @var list<int> */
    private array $posSales = [];

    private int $drawerCash = 0;

    public function run(): void
    {
        $owner = User::where('role', 'owner')->where('active', true)->orderBy('id')->first();
        if (! $owner) {
            throw new RuntimeException(__('Create the owner account before adding demo data.'));
        }
        if (DB::table('documents')->exists()) {
            throw new RuntimeException(__('Demo data can only be added to an installation without sales or purchases.'));
        }
        if (DB::table('products')->exists() && ! DB::table('products')->where('sku', 'OB-100')->exists()) {
            throw new RuntimeException(__('Demo data can only be added to an empty catalogue or the sample catalogue.'));
        }
        $this->owner = $owner;
        mt_srand(20261124);
        $this->realNow = Carbon::now()->subMinute();
        $start = Carbon::today()->subDays(self::DAYS + 1);
        $previousUser = Auth::user();
        $previousRequest = app()->bound('request') ? app('request') : null;
        Auth::setUser($owner);
        try {
            DB::transaction(fn () => $this->build($start));
        } finally {
            Carbon::setTestNow();
            $previousUser ? Auth::setUser($previousUser) : Auth::forgetUser();
            if ($previousRequest) {
                app()->instance('request', $previousRequest);
            }
        }
    }

    private function build(Carbon $start): void
    {

        $this->at($start->copy()->subDays(4)->setTime(9, 0), function () {
            if (! DB::table('products')->exists()) {
                (new PerfumeSeeder)->run();
            }
            $this->settings();
            $this->catalogue();
            $this->contacts();
        });
        $this->purchasing($start);
        $this->production($start);
        for ($day = 0; $day <= self::DAYS; $day++) {
            $this->businessDay($start->copy()->addDays($day), $day);
        }
        $this->at(Carbon::today()->setTime(9, 30), fn () => $this->projects());

    }

    private function settings(): void
    {
        foreach (['vat_registered' => '1', 'tax_id' => DB::table('settings')->where('key', 'tax_id')->value('value') ?: '100000000000003', 'loyalty_enabled' => '1', 'loyalty_points_per_aed' => '1', 'loyalty_point_value_fils' => '5', 'invoice_footer' => 'Thank you for choosing us. Bank transfer: IBAN AE00 0000 0000 0000 0000 000 (demo).'] as $key => $value) {
            DB::table('settings')->updateOrInsert(['key' => $key], ['value' => $value]);
        }
    }

    private function catalogue(): void
    {
        $ref = fn (string $brand, string $name) => DB::table('references')->where('brand', $brand)->where('name', $name)->value('id');
        $finished = [
            ['OR-100', 'Oud Royale', 'عود رويال', 32000, 9500, ['Oud', 'Woody', 'Amber'], 'Arabian style', 'Unisex', ['Oud', 'Cardamom', 'Rosewood'], ['Sandalwood', 'Vetiver'], ['Amber', 'Tonka bean', 'Vanilla'], $ref('Tom Ford', 'Oud Wood')],
            ['MS-100', 'Midnight Saffron', 'زعفران منتصف الليل', 29000, 8000, ['Amber', 'Spicy'], 'Fusion', 'Unisex', ['Saffron', 'Jasmine'], ['Amberwood', 'Ambergris'], ['Fir resin', 'Cedar'], $ref('Maison Francis Kurkdjian', 'Baccarat Rouge 540')],
            ['BH-100', 'Blue Horizon', 'الأفق الأزرق', 17500, 5200, ['Fresh', 'Aromatic'], 'French style', 'Men', ['Bergamot', 'Pepper'], ['Lavender', 'Geranium'], ['Ambroxan', 'Cedar'], $ref('Dior', 'Sauvage EDT')],
            ['WM-050', 'White Musk Cloud', 'غيمة المسك الأبيض', 14000, 3800, ['Musk', 'Floral'], 'French style', 'Women', ['Bergamot', 'Pink pepper'], ['White musk', 'Ambrette'], ['Patchouli', 'Woody notes'], $ref('Initio', 'Musk Therapy')],
            ['RD-012', 'Rose Damask Attar', 'عطر الورد الدمشقي', 21000, 6000, ['Floral', 'Oud'], 'Arabian style', 'Women', ['Rose'], ['Taif rose', 'Oud'], ['Musk', 'Amber'], $ref('Montale', 'Roses Musk')],
            ['TV-100', 'Tobacco Velvet', 'مخمل التبغ', 26000, 7800, ['Amber', 'Spicy', 'Gourmand'], 'Fusion', 'Unisex', ['Tobacco leaf', 'Spices'], ['Vanilla', 'Cacao', 'Tonka bean'], ['Dried fruits', 'Woody notes'], $ref('Tom Ford', 'Tobacco Vanille')],
            ['PE-100', 'Pineapple Empire', 'إمبراطورية الأناناس', 23000, 7000, ['Fruity', 'Woody'], 'French style', 'Men', ['Pineapple', 'Bergamot', 'Blackcurrant'], ['Birch', 'Patchouli'], ['Musk', 'Oakmoss', 'Ambergris'], $ref('Creed', 'Aventus')],
            ['VG-050', 'Vanilla Noir', 'فانيلا نوار', 16000, 4500, ['Gourmand', 'Amber'], 'Fusion', 'Women', ['Pear', 'Pink pepper'], ['Coffee', 'Jasmine'], ['Vanilla', 'Patchouli', 'Cedar'], $ref('Yves Saint Laurent', 'Black Opium')],
        ];
        foreach ($finished as [$sku, $name, $nameAr, $price, $cost, $families, $style, $audience, $top, $heart, $base, $reference]) {
            $attar = str_ends_with($sku, '012');
            $this->post(CatalogueController::class, 'saveProduct', [
                'sku' => $sku, 'name' => $name, 'name_ar' => $nameAr, 'kind' => 'finished', 'unit' => 'bottle', 'barcode' => '', 'price' => $this->money($price), 'cost' => $this->money($cost), 'tax' => '5', 'reorder' => '12',
                'families' => $families, 'notes' => array_slice(array_merge($top, $heart, $base), 0, 6), 'tags' => [], 'style' => $style, 'origin' => 'UAE', 'audience' => $audience,
                'concentration' => $attar ? 'Attar' : 'EDP', 'size' => $attar ? '12 ml' : (str_ends_with($sku, '050') ? '50 ml' : '100 ml'),
                'description' => "{$name}: a fictional demonstration fragrance. Replace it with your own products and photos.", 'reference_id' => $reference, 'active' => true, 'sales_allowed' => true,
                'fragrance_profile' => ['top_notes' => $top, 'heart_notes' => $heart, 'base_notes' => $base, 'smell_description' => 'Demo description: how the scent opens, develops and dries down.', 'intensity' => 'Moderate to strong', 'longevity' => '8–10 hours', 'projection' => 'Moderate', 'season' => 'All year', 'occasion' => 'Day and evening'],
            ]);
        }
        $materials = [
            ['RAW-OUD', 'Oud oil', 'raw', 'ml', 1200, 50000], ['RAW-ROSE', 'Rose absolute', 'raw', 'ml', 650, 100000], ['RAW-AMB', 'Amber accord', 'raw', 'ml', 120, 200000],
            ['RAW-MUSK', 'White musk accord', 'raw', 'ml', 90, 200000], ['RAW-SAF', 'Saffron accord', 'raw', 'ml', 250, 100000], ['RAW-VAN', 'Vanilla absolute', 'raw', 'ml', 300, 100000],
            ['PACK-B50', 'Glass bottle 50 ml', 'packaging', 'piece', 420, 100000], ['PACK-CAPG', 'Gold cap', 'packaging', 'piece', 210, 100000], ['PACK-GIFT', 'Luxury gift box', 'packaging', 'piece', 650, 50000],
        ];
        foreach ($materials as [$sku, $name, $kind, $unit, $cost, $reorder]) {
            $this->post(CatalogueController::class, 'saveProduct', ['sku' => $sku, 'name' => $name, 'kind' => $kind, 'unit' => $unit, 'barcode' => '', 'price' => '0', 'cost' => $this->money($cost), 'tax' => '5', 'reorder' => (string) ($reorder / 1000), 'families' => [], 'notes' => [], 'tags' => [], 'active' => true, 'sales_allowed' => false, 'description' => 'Demo material.']);
        }
        $this->sku = DB::table('products')->pluck('id', 'sku')->map(fn ($id) => (int) $id)->all();
        $arabic = ['OB-100' => 'نسيم المحيط', 'AR-100' => 'طقوس العنبر', 'RV-050' => 'حجاب الورد', 'CM-100' => 'الأرز والطحلب', 'VS-050' => 'حرير الفانيلا', 'CP-100' => 'قصيدة الحمضيات'];
        foreach ($arabic as $sku => $name) {
            DB::table('products')->where('sku', $sku)->update(['name_ar' => $name, 'tax_bp' => 500]);
        }
        DB::table('products')->where('kind', '!=', 'finished')->update(['tax_bp' => 500]);
        // Opening stock for ready-made lines that are bought in or were made before the demo period.
        foreach (['WM-050' => 60, 'RD-012' => 40, 'PE-100' => 48, 'VG-050' => 54] as $sku => $bottles) {
            $cost = (int) DB::table('products')->where('sku', $sku)->value('cost_cents');
            Stock::move($this->sku[$sku], 1, 'OPEN-'.$sku, $bottles * 1000, 'Opening stock', 'DEMO', $this->owner->id, $bottles * $cost, 'Opening stock at cost');
            $this->transfer($sku, 'OPEN-'.$sku, intdiv($bottles, 2));
        }
    }

    private function contacts(): void
    {
        $people = [
            'noor' => ['Al Noor Boutique', 'customer', 'orders@alnoor-boutique.example', '+971 4 555 0101', 'The Dubai Mall, Dubai', '100223344500003', '60000', 30],
            'gulf' => ['Gulf Gifts Trading', 'customer', 'buying@gulfgifts.example', '+971 6 555 0202', 'Al Majaz, Sharjah', '100334455600003', '50000', 45],
            'amwaj' => ['Amwaj Hotel Spa', 'customer', 'spa@amwaj-hotel.example', '+971 2 555 0303', 'Corniche, Abu Dhabi', '', '40000', 30],
            'sara' => ['Sara Al Mansoori', 'customer', 'sara@example.test', '+971 50 555 0404', 'Jumeirah, Dubai', '', '0', 0],
            'omar' => ['Omar Haddad', 'customer', 'omar@example.test', '+971 55 555 0505', 'Business Bay, Dubai', '', '0', 0],
            'layla' => ['Layla Rahman', 'customer', 'layla@example.test', '+971 52 555 0606', 'Al Barsha, Dubai', '', '0', 0],
            'fatima' => ['Fatima Khan', 'customer', 'fatima@example.test', '+971 56 555 0707', 'Deira, Dubai', '', '0', 0],
            'ahmed' => ['Ahmed Siddiqui', 'customer', 'ahmed@example.test', '+971 54 555 0808', 'Al Nahda, Sharjah', '', '0', 0],
            'grasse' => ['Grasse Essences Co.', 'supplier', 'sales@grasse-essences.example', '+33 4 93 00 00 00', 'Grasse, France', '', '0', 45],
            'glass' => ['Emirates Glass Packaging', 'supplier', 'orders@emirates-glass.example', '+971 6 555 0909', 'Industrial Area, Sharjah', '100445566700003', '0', 30],
            'oud' => ['Royal Oud Traders', 'supplier', 'trade@royal-oud.example', '+971 4 555 1010', 'Spice Souk, Deira', '', '0', 15],
        ];
        foreach ($people as $key => [$name, $kind, $email, $phone, $address, $tax, $credit, $terms]) {
            $this->contact[$key] = (int) $this->post(ContactController::class, 'contacts', ['name' => $name, 'kind' => $kind, 'email' => $email, 'phone' => $phone, 'address' => $address, 'tax_id' => $tax, 'credit' => $credit, 'terms_days' => $terms])['id'];
        }
        $this->contact['partner'] = (int) DB::table('contacts')->where('kind', 'customer')->orderBy('id')->value('id');
        $this->contact['supply'] = (int) DB::table('contacts')->where('kind', 'supplier')->orderBy('id')->value('id');
        // Wholesale terms: Al Noor gets 10 % off the list, Gulf Gifts has fixed prices on two lines.
        $this->post(ContactController::class, 'pricing', ['discount' => '10', 'prices' => []], $this->contact['noor']);
        $this->post(ContactController::class, 'pricing', ['discount' => '0', 'prices' => [['product_id' => $this->sku['OR-100'], 'price' => '265.00'], ['product_id' => $this->sku['MS-100'], 'price' => '240.00']]], $this->contact['gulf']);
    }

    private function purchasing(Carbon $start): void
    {
        $orders = [];
        $this->at($start->copy()->subDays(2)->setTime(11, 0), function () use (&$orders) {
            $orders['grasse'] = $this->document('PurchaseOrder', 'grasse', 1, [['RAW-ROSE', 2000], ['RAW-AMB', 6000], ['RAW-MUSK', 6000], ['RAW-SAF', 3000], ['RAW-VAN', 3000]], 'Credit', 0, 'Q-2026-118');
            $orders['glass'] = $this->document('PurchaseOrder', 'glass', 1, [['PACK-BOT', 600], ['PACK-B50', 400], ['PACK-CAPG', 900], ['PACK-GIFT', 500]], 'Credit', 0, 'EG-5531');
            $orders['oud'] = $this->document('PurchaseOrder', 'oud', 1, [['RAW-OUD', 1200]], 'Credit', 0, 'RO-77');
        });
        $this->at($start->copy()->subDays(1)->setTime(10, 0), function () use ($orders) {
            $this->receive($orders['glass'], null, 'EG-INV-9921');
            $this->receive($orders['oud'], null, 'RO-INV-310');
            $this->receive($orders['grasse'], 0.6, 'GE-INV-4410');
            $alcohol = $this->document('Purchase', 'supply', 1, [['RAW-ALC', 80000]], 'Bank', null, 'ALC-2207');
        });
        $this->at($start->copy()->addDays(9)->setTime(10, 0), fn () => $this->receive($orders['grasse'], null, 'GE-INV-4431'));
        // Pay suppliers on their terms.
        foreach ([[12, 'glass'], [14, 'oud'], [30, 'grasse']] as [$day, $key]) {
            $this->at($start->copy()->addDays($day)->setTime(15, 0), function () use ($key) {
                foreach (DB::table('documents')->where('contact_id', $this->contact[$key])->where('kind', 'Purchase')->get() as $bill) {
                    $due = (int) $bill->total_cents - (int) $bill->paid_cents - (int) $bill->returned_cents + (int) $bill->refunded_cents;
                    if ($due > 0) {
                        Documents::payment($bill->id, $due, 'Bank', $this->owner->id);
                    }
                }
            });
        }
        // Ten bottles arrived chipped: sent back to the glass supplier.
        $this->at($start->copy()->addDays(6)->setTime(12, 0), function () {
            $bill = DB::table('documents')->where('contact_id', $this->contact['glass'])->where('kind', 'Purchase')->orderBy('id')->first();
            $line = DB::table('document_lines')->where('document_id', $bill->id)->where('product_id', $this->sku['PACK-BOT'])->first();
            if ($line) {
                Documents::returnToSupplier($bill->id, [['line_id' => $line->id, 'quantity' => '10']], 'Bank', 'Chipped necks on arrival', $this->owner->id);
            }
        });
    }

    private function production(Carbon $start): void
    {
        $formulas = [
            'OR-100' => ['OR-F1', 'Oud Royale · house formula', [['RAW-OUD', '3'], ['RAW-AMB', '6'], ['RAW-ALC', '68']], [['PACK-BOT', '1'], ['PACK-CAPG', '1'], ['PACK-GIFT', '1']], 21],
            'MS-100' => ['MS-F1', 'Midnight Saffron · house formula', [['RAW-SAF', '5'], ['RAW-AMB', '7'], ['RAW-MUSK', '4'], ['RAW-ALC', '64']], [['PACK-BOT', '1'], ['PACK-CAPG', '1'], ['PACK-GIFT', '1']], 14],
            'BH-100' => ['BH-F1', 'Blue Horizon · house formula', [['RAW-CON', '9'], ['RAW-MUSK', '3'], ['RAW-ALC', '70']], [['PACK-BOT', '1'], ['PACK-CAPG', '1']], 7],
            'TV-100' => ['TV-F1', 'Tobacco Velvet · house formula', [['RAW-VAN', '6'], ['RAW-AMB', '6'], ['RAW-ALC', '66']], [['PACK-BOT', '1'], ['PACK-CAPG', '1'], ['PACK-GIFT', '1']], 21],
        ];
        $ids = [];
        $this->at($start->copy()->setTime(9, 0), function () use ($formulas, &$ids) {
            foreach ($formulas as $sku => [$code, $name, $ingredients, $packaging, $days]) {
                $id = (int) $this->post(ManufacturingController::class, 'saveFormula', [
                    'code' => $code, 'name' => $name, 'product_id' => $this->sku[$sku], 'maturation_days' => $days, 'instructions' => 'Weigh, blend, macerate, chill-filter and fill. Demo instructions.',
                    'ingredients' => array_map(fn ($i) => ['product_id' => $this->sku[$i[0]], 'quantity' => $i[1]], $ingredients),
                    'packaging' => array_map(fn ($i) => ['product_id' => $this->sku[$i[0]], 'quantity' => $i[1]], $packaging),
                ])['id'];
                app(ManufacturingController::class)->approveFormula($id);
                $ids[$sku] = $id;
            }
        });
        // [formula, planned, start day, finish day or null, accepted, rejected]
        $batches = [['OR-100', 120, 2, 24, 117, 3], ['MS-100', 100, 10, 25, 99, 1], ['BH-100', 150, 26, 34, 148, 2], ['OR-100', 80, 50, 72, 80, 0], ['MS-100', 90, 70, 85, 88, 2], ['TV-100', 100, 84, null, 0, 0]];
        foreach ($batches as [$sku, $planned, $from, $to, $accepted, $rejected]) {
            $batch = 0;
            $this->at($start->copy()->addDays($from)->setTime(8, 30), function () use ($ids, $sku, $planned, &$batch) {
                $batch = (int) $this->post(ManufacturingController::class, 'batches', ['formula_id' => $ids[$sku], 'location_id' => 1, 'planned' => $planned, 'estimated_labour_cost' => '450', 'estimated_overhead_cost' => '200'])['id'];
                $this->post(ManufacturingController::class, 'batchAction', ['action' => 'issue'], $batch);
                $this->post(ManufacturingController::class, 'batchAction', ['action' => 'mature'], $batch);
            });
            if ($to === null) {
                continue;
            }
            $this->at($start->copy()->addDays($to)->setTime(16, 0), function () use ($batch, $sku, $accepted, $rejected) {
                $this->post(ManufacturingController::class, 'batchAction', ['action' => 'qc', 'passed' => true, 'qc_notes' => 'Clear, colour and odour to standard.'], $batch);
                $this->post(ManufacturingController::class, 'batchAction', ['action' => 'complete', 'accepted' => $accepted, 'rejected' => $rejected, 'loss_reason' => $rejected ? 'Leaking pumps' : null, 'labour_cost' => '450', 'overhead_cost' => '200'], $batch);
                $lot = (string) DB::table('balances')->where('product_id', $this->sku[$sku])->where('location_id', 1)->where('quantity_milli', '>', 0)->orderByDesc('id')->value('lot');
                Stock::setExpiry($this->sku[$sku], $lot, now()->addYears(3)->toDateString());
                $this->transfer($sku, $lot, intdiv($accepted, 2));
            });
        }
    }

    private function businessDay(Carbon $date, int $day): void
    {
        $weekend = in_array($date->dayOfWeek, [Carbon::FRIDAY, Carbon::SATURDAY], true);
        $this->at($date->copy()->setTime(9, 45), function () {
            $this->post(ShiftController::class, 'shifts', ['action' => 'open', 'amount' => '300']);
            $this->drawerCash = 30000;
        });
        if ($day % 7 === 0) {
            $this->at($date->copy()->setTime(9, 15), fn () => $this->replenishBoutique());
        }
        $sales = $weekend ? mt_rand(4, 7) : mt_rand(1, 4);
        for ($i = 0; $i < $sales; $i++) {
            $this->at($date->copy()->setTime(11 + intdiv($i * 9, $sales), mt_rand(0, 59)), fn () => $this->posSale());
        }
        if ($day % 6 === 3) {
            $this->at($date->copy()->setTime(12, 30), fn () => $this->wholesaleInvoice($date));
        }
        if ($day % 15 === 7) {
            $this->at($date->copy()->setTime(13, 0), function () use ($day) {
                $quote = $this->document('Quotation', $day % 2 ? 'amwaj' : 'gulf', 1, [['OR-100', 6], ['MS-100', 6], ['WM-050', 12]], 'Credit', 0);
                if ($day < 70) {
                    $this->later(3, function () use ($quote) {
                        try {
                            Documents::convertQuotation($quote, $this->owner->id);
                        } catch (ValidationException) {
                            // Over the credit limit: the quotation stays open.
                        }
                    });
                }
            });
        }
        $this->collect($date);
        if ($date->day === 1 || $day === 0) {
            $this->at($date->copy()->setTime(9, 0), fn () => $this->monthlyExpenses($date));
        }
        if ($day % 7 === 4) {
            $this->at($date->copy()->setTime(18, 0), function () use ($date) {
                $this->post(ExpenseController::class, 'store', ['spent_on' => $date->toDateString(), 'category' => 'Cleaning & supplies', 'description' => 'Shop cleaning and tissues', 'amount' => '45', 'tax' => '2.14', 'method' => 'Cash', 'from_drawer' => true]);
                $this->drawerCash -= 4500;
            });
        }
        if (in_array($day, [20, 47, 75], true) && $this->posSales) {
            $this->at($date->copy()->setTime(17, 0), fn () => $this->posReturn());
        }
        if ($day === 60) {
            $this->at($date->copy()->setTime(19, 0), fn () => $this->stockCount());
        }
        $this->at($date->copy()->setTime(20, 30), function () {
            $off = mt_rand(0, 9) === 0 ? mt_rand(-2000, 1000) : 0;
            $this->post(ShiftController::class, 'shifts', ['action' => 'close', 'amount' => $this->money($this->drawerCash + $off)]);
        });
    }

    /** Weekly top-up of the boutique from the warehouse: up to 8 bottles of each finished line. */
    private function replenishBoutique(): void
    {
        foreach (DB::table('products')->where('kind', 'finished')->where('active', true)->pluck('sku', 'id') as $id => $sku) {
            $shop = (int) DB::table('balances')->where('product_id', $id)->where('location_id', 2)->sum('quantity_milli');
            if ($shop >= 6000) {
                continue;
            }
            $lot = DB::table('balances')->where('product_id', $id)->where('location_id', 1)->where('quantity_milli', '>=', 4000)->orderBy('id')->first();
            if ($lot) {
                $this->transfer($sku, $lot->lot, min(8 - intdiv($shop, 1000), intdiv((int) $lot->quantity_milli, 1000) - 2));
            }
        }
    }

    private function posSale(): void
    {
        $available = DB::table('balances as b')->join('products as p', 'p.id', '=', 'b.product_id')->where('b.location_id', 2)->where('p.kind', 'finished')->where('p.active', true)
            ->groupBy('b.product_id')->havingRaw('SUM(b.quantity_milli) >= 2000')->pluck('b.product_id')->all();
        if (! $available) {
            return;
        }
        shuffle($available);
        $lines = [];
        foreach (array_slice($available, 0, mt_rand(1, min(3, count($available)))) as $id) {
            $lines[] = [array_search($id, $this->sku, true), mt_rand(1, 10) > 8 ? 2 : 1];
        }
        $retail = ['sara', 'omar', 'layla', 'fatima', 'ahmed'];
        $customer = mt_rand(1, 10) <= 4 ? $retail[array_rand($retail)] : null;
        $total = $this->total($lines);
        $payments = match (mt_rand(1, 10)) {
            1, 2, 3, 4 => [['method' => 'Cash', 'amount' => $this->money($total)]],
            5, 6, 7, 8, 9 => [['method' => 'Card', 'amount' => $this->money($total)]],
            default => [['method' => 'Cash', 'amount' => $this->money(intdiv($total, 2))], ['method' => 'Card', 'amount' => $this->money($total - intdiv($total, 2))]],
        };
        $result = Documents::create(['kind' => 'Sale', 'contact_id' => $customer ? $this->contact[$customer] : null, 'location_id' => 2, 'payments' => $payments, 'notes' => null, 'lines' => $this->lines($lines)], $this->owner->id);
        foreach ($payments as $payment) {
            if ($payment['method'] === 'Cash') {
                $this->drawerCash += Amounts::parse($payment['amount']);
            }
        }
        $this->posSales[] = (int) $result['id'];
    }

    private function wholesaleInvoice(Carbon $date): void
    {
        $buyers = ['noor', 'gulf', 'amwaj', 'partner'];
        $buyer = $buyers[array_rand($buyers)];
        $choice = ['OR-100', 'MS-100', 'BH-100', 'WM-050', 'PE-100', 'VG-050', 'OB-100', 'AR-100'];
        shuffle($choice);
        $lines = [];
        foreach (array_slice($choice, 0, mt_rand(2, 3)) as $sku) {
            $stock = (int) DB::table('balances')->where('product_id', $this->sku[$sku])->where('location_id', 1)->sum('quantity_milli');
            $quantity = min(mt_rand(1, 3) * 6, intdiv($stock, 1000) - 4);
            if ($quantity >= 6) {
                $lines[] = [$sku, $quantity];
            }
        }
        if (! $lines) {
            return;
        }
        try {
            $id = $this->document('Invoice', $buyer, 1, $lines, 'Credit', 0);
        } catch (\Throwable) {
            return; // Credit limit reached: the buyer pays first.
        }
        $terms = (int) DB::table('contacts')->where('id', $this->contact[$buyer])->value('terms_days');
        $this->receivables[] = ['id' => $id, 'due' => $date->copy()->addDays(max(7, $terms - mt_rand(0, 10)))->toDateString()];
    }

    private function collect(Carbon $date): void
    {
        foreach ($this->receivables as $i => $invoice) {
            if ($invoice['due'] !== $date->toDateString()) {
                continue;
            }
            unset($this->receivables[$i]);
            if (mt_rand(1, 10) === 1) {
                continue; // a few invoices stay overdue, for the ageing report
            }
            $this->at($date->copy()->setTime(14, 15), function () use ($invoice) {
                $doc = DB::table('documents')->find($invoice['id']);
                $due = (int) $doc->total_cents + (int) $doc->refunded_cents - (int) $doc->paid_cents - (int) $doc->returned_cents;
                $amount = mt_rand(1, 4) === 1 ? intdiv($due, 2) : $due;
                if ($amount > 0) {
                    Documents::payment($doc->id, $amount, 'Bank', $this->owner->id);
                }
            });
        }
    }

    private function monthlyExpenses(Carbon $date): void
    {
        foreach ([['Rent', 'Boutique and warehouse rent', '8500', '0', 'Bank'], ['Salaries & wages', 'Staff salaries', '12000', '0', 'Bank'], ['Utilities', 'DEWA electricity and water', '1850', '88.10', 'Bank'], ['Marketing & advertising', 'Instagram and Google campaigns', '2400', '114.29', 'Card'], ['Software & internet', 'Internet, phone and software', '650', '30.95', 'Card']] as [$category, $description, $amount, $tax, $method]) {
            $this->post(ExpenseController::class, 'store', ['spent_on' => $date->toDateString(), 'category' => $category, 'description' => $description, 'amount' => $amount, 'tax' => $tax, 'method' => $method]);
        }
    }

    private function posReturn(): void
    {
        $sale = $this->posSales[array_rand($this->posSales)];
        $line = DB::table('document_lines')->where('document_id', $sale)->orderBy('id')->first();
        $doc = DB::table('documents')->find($sale);
        if (! $line || $doc->returned_cents > 0) {
            return;
        }
        $result = Documents::returnLines($sale, [['line_id' => $line->id, 'quantity' => '1']], 'Restock', $doc->method === 'Card' ? 'Card' : 'Cash', $this->owner->id);
        if ($doc->method !== 'Card') {
            $this->drawerCash -= (int) ($result['refund_cents'] ?? 0);
        }
    }

    private function stockCount(): void
    {
        $rows = DB::table('balances')->where('location_id', 2)->where('quantity_milli', '>', 0)->orderBy('product_id')->limit(6)->get();
        $lines = [];
        foreach ($rows as $i => $row) {
            $expected = intdiv((int) $row->quantity_milli, 1000);
            $lines[] = ['product_id' => $row->product_id, 'lot' => $row->lot, 'expected' => (string) $expected, 'counted' => (string) ($i === 2 ? max(0, $expected - 1) : $expected)];
        }
        if ($lines) {
            $this->post(InventoryController::class, 'counts', ['location_id' => 2, 'notes' => 'Monthly boutique count (demo): one tester bottle missing.', 'lines' => $lines]);
        }
    }

    private function projects(): void
    {
        foreach ([
            ['Ramadan gift box', 'noor', 'Packaging', 'Gold-foil gift box for Oud Royale and Midnight Saffron, 300 units.', 14, '9500', '5200'],
            ['Amwaj spa signature scent', 'amwaj', 'Private Label', 'Private label room spray and 50 ml perfume for the hotel spa, with their logo.', 30, '18000', '9800'],
            ['Boutique shelf display', null, 'Design', 'Back-lit shelf display and price cards for the retail boutique.', 21, '0', '2400'],
        ] as [$name, $contact, $type, $brief, $days, $charge, $cost]) {
            $this->post(DesignProjectController::class, 'projects', ['name' => $name, 'contact_id' => $contact ? $this->contact[$contact] : null, 'type' => $type, 'brief' => $brief, 'due_date' => now()->addDays($days)->toDateString(), 'assigned_id' => $this->owner->id, 'charge' => $charge, 'cost' => $cost, 'specification' => 'Demo specification.']);
        }
    }

    /**
     * @param  list<array{0: string, 1: int}>  $lines  SKU and quantity
     */
    private function document(string $kind, string $contact, int $location, array $lines, string $method, ?int $paid, ?string $bill = null): int
    {
        $total = in_array($kind, ['Purchase', 'PurchaseOrder']) ? null : null;
        $data = ['kind' => $kind, 'contact_id' => $this->contact[$contact], 'location_id' => $location, 'method' => $method, 'notes' => null, 'bill_reference' => $bill, 'lines' => $this->lines($lines)];
        if ($method !== 'Credit') {
            $data['payments'] = [['method' => $method, 'amount' => $this->money($this->total($lines, $kind, $this->contact[$contact]))]];
        } else {
            $data['paid'] = '0';
        }

        return (int) Documents::create($data, $this->owner->id)['id'];
    }

    private function receive(int $order, ?float $share, string $bill): void
    {
        $items = [];
        foreach (DB::table('document_lines')->where('document_id', $order)->get() as $line) {
            $open = (int) $line->quantity_milli - (int) ($line->received_milli ?? 0);
            $quantity = $share ? (int) floor($open * $share / 1000) * 1000 : $open;
            if ($quantity > 0) {
                $items[] = ['line_id' => $line->id, 'quantity' => (string) ($quantity / 1000)];
            }
        }
        if ($items) {
            Documents::receiveOrder($order, $items, 1, $bill, $this->owner->id);
            foreach ($items as $item) {
                $product = (int) DB::table('document_lines')->where('id', $item['line_id'])->value('product_id');
                $lot = DB::table('balances')->where('product_id', $product)->where('location_id', 1)->orderByDesc('id')->value('lot');
                if ($lot && DB::table('products')->where('id', $product)->value('kind') === 'raw') {
                    Stock::setExpiry($product, $lot, now()->addMonths(mt_rand(10, 30))->toDateString());
                }
            }
        }
    }

    private function transfer(string $sku, string $lot, int $bottles): void
    {
        if ($bottles > 0) {
            $this->post(InventoryController::class, 'stock', ['product_id' => $this->sku[$sku], 'location_id' => 1, 'lot' => $lot, 'quantity' => (string) $bottles, 'reason' => 'Boutique replenishment', 'target_id' => 2]);
        }
    }

    /**
     * @param  list<array{0: string, 1: int}>  $lines
     * @return list<array{product_id: int, quantity: string}>
     */
    private function lines(array $lines): array
    {
        return array_map(fn ($l) => ['product_id' => $this->sku[$l[0]], 'quantity' => (string) $l[1]], $lines);
    }

    /**
     * Document total in cents, priced the way Documents::create prices it (customer prices, discount, VAT).
     *
     * @param  list<array{0: string, 1: int}>  $lines
     */
    private function total(array $lines, string $kind = 'Sale', ?int $contact = null): int
    {
        $discountBp = $contact ? (int) DB::table('contacts')->where('id', $contact)->value('discount_bp') : 0;
        $prices = $contact ? DB::table('customer_prices')->where('contact_id', $contact)->pluck('price_cents', 'product_id') : collect();
        $total = 0;
        foreach ($lines as [$sku, $quantity]) {
            $p = DB::table('products')->find($this->sku[$sku]);
            $purchase = in_array($kind, ['Purchase', 'PurchaseOrder']);
            $price = $purchase ? (int) $p->cost_cents : (int) ($prices[$p->id] ?? $p->price_cents);
            $gross = $price * $quantity;
            $discount = ! $purchase && $discountBp && ! isset($prices[$p->id]) ? Amounts::roundDivide($gross * $discountBp, 10000) : 0;
            $net = $gross - $discount;
            $total += $net + Amounts::roundDivide($net * (int) $p->tax_bp, 10000);
        }

        return $total;
    }

    private function money(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }

    /** @var list<array{0: int, 1: callable}> */
    private array $pending = [];

    /** Run $fn $days later, at the start of that business day. */
    private function later(int $days, callable $fn): void
    {
        $this->pending[] = [now()->copy()->addDays($days)->startOfDay()->setTime(10, 30)->getTimestamp(), $fn];
    }

    private function at(Carbon $moment, callable $fn): mixed
    {
        foreach ($this->pending as $i => [$when, $task]) {
            if ($when <= $moment->getTimestamp()) {
                unset($this->pending[$i]);
                Carbon::setTestNow(Carbon::createFromTimestamp($when));
                $task();
            }
        }
        Carbon::setTestNow($moment->gt($this->realNow) ? $this->realNow->copy() : $moment);

        return $fn();
    }

    /**
     * Call a controller action as the signed-in owner, with validation and request identifiers.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function post(string $controller, string $method, array $data, int ...$arguments): array
    {
        array_walk_recursive($data, function (&$value) {
            $value = $value === '' ? null : $value;
        });
        $request = Request::create('/demo', 'POST', $data);
        $request->headers->set('Idempotency-Key', (string) Str::uuid());
        $request->setUserResolver(fn () => $this->owner);
        app()->instance('request', $request);
        $result = app($controller)->{$method}($request, ...$arguments);

        return is_array($result) ? $result : (array) ($result instanceof JsonResponse ? $result->getData(true) : []);
    }
}
