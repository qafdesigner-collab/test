<?php

namespace Database\Seeders;

use App\Services\Stock;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PerfumeSeeder extends Seeder
{
    public function run(): void
    {
        if (DB::table('products')->exists()) {
            throw new \RuntimeException('Demo seeding requires an empty product catalogue. Existing records were not changed.');
        }
        DB::transaction(function () {
            $defaults = ['company_name' => 'Atelier Fragrance Studio', 'address' => 'Dubai, United Arab Emirates', 'email' => 'hello@example.test', 'phone' => '+971 00 000 0000', 'tax_id' => '', 'currency' => 'AED'];
            foreach ($defaults as $k => $v) {
                DB::table('settings')->updateOrInsert(['key' => $k], ['value' => $v]);
            }
            DB::table('locations')->insertOrIgnore([['id' => 1, 'name' => 'Main warehouse', 'kind' => 'warehouse', 'created_at' => now(), 'updated_at' => now()], ['id' => 2, 'name' => 'Retail boutique', 'kind' => 'shop', 'created_at' => now(), 'updated_at' => now()]]);
            $ref = DB::table('references')->insertGetId(['brand' => 'Fictional Reference House', 'name' => 'Coastal No. 7', 'notes' => 'Fictional internal reference for search demonstration.', 'created_at' => now(), 'updated_at' => now()]);
            $items = [['OB-100', 'Ocean Breeze', 'finished', 'bottle', 12500, 4200, ['Fresh', 'Citrus', 'Aquatic'], 'French style', 'Unisex', '100 ml'], ['AR-100', 'Amber Ritual', 'finished', 'bottle', 18500, 6100, ['Amber', 'Woody'], 'Arabian style', 'Unisex', '100 ml'], ['RV-050', 'Rose Veil', 'finished', 'bottle', 15500, 4800, ['Floral', 'Fresh'], 'French style', 'Women', '50 ml'], ['CM-100', 'Cedar & Moss', 'finished', 'bottle', 16500, 5500, ['Woody', 'Aromatic'], 'French style', 'Men', '100 ml'], ['VS-050', 'Vanilla Silk', 'finished', 'bottle', 14500, 4300, ['Gourmand', 'Amber'], 'Fusion', 'Unisex', '50 ml'], ['CP-100', 'Citrus Poem', 'finished', 'bottle', 11500, 3600, ['Citrus', 'Fresh'], 'French style', 'Unisex', '100 ml'], ['RAW-CON', 'Marine concentrate', 'raw', 'ml', 0, 40, [], '', '', ''], ['RAW-ALC', 'Perfumer alcohol', 'raw', 'ml', 0, 3, [], '', '', ''], ['PACK-BOT', 'Glass bottle 100 ml', 'packaging', 'piece', 0, 550, [], '', '', ''], ['PACK-CAP', 'Cap and pump set', 'packaging', 'piece', 0, 250, [], '', '', ''], ['PACK-BOX', 'Perfume gift box', 'packaging', 'piece', 0, 400, [], '', '', ''], ['SVC-DES', 'Packaging design service', 'service', 'hour', 20000, 8000, [], '', '', '']];
            foreach ($items as $i => $a) {
                [$sku,$name,$kind,$unit,$price,$cost,$families,$style,$audience,$size] = $a;
                $id = DB::table('products')->insertGetId(['sku' => $sku, 'name' => $name, 'kind' => $kind, 'unit' => $unit, 'barcode' => str_pad((string) ($i + 1), 12, '0', STR_PAD_LEFT), 'price_cents' => $price, 'cost_cents' => $cost, 'tax_bp' => 0, 'reorder_milli' => $kind === 'raw' ? 500000 : 5000, 'families' => json_encode($families), 'notes' => json_encode($i === 0 ? ['Bergamot', 'Marine accord', 'Musk'] : []), 'tags' => '[]', 'style' => $style, 'origin' => $kind === 'finished' ? 'UAE' : '', 'audience' => $audience, 'concentration' => $kind === 'finished' ? 'EDP' : '', 'size' => $size, 'description' => $kind === 'finished' ? 'A fictional demonstration fragrance. Upload your own product photography.' : 'Demo material/service.', 'reference_id' => $i === 0 ? $ref : null, 'active' => true, 'sales_allowed' => in_array($kind, ['finished','resale','service']), 'created_at' => now(), 'updated_at' => now()]);
                if ($kind !== 'service') {
                    Stock::move($id, 1, 'DEMO-OPENING', ($kind === 'raw' ? 20000 : ($kind === 'packaging' ? 500 : 60 + $i * 15)) * 1000, 'Demo opening stock', 'DEMO', null);
                    if ($kind === 'finished') {
                        Stock::move($id, 2, 'DEMO-RETAIL', (20 + $i * 3) * 1000, 'Demo opening stock', 'DEMO', null);
                    }
                }
            }
            DB::table('contacts')->insert([['name' => 'Boutique Partner · demo', 'kind' => 'customer', 'email' => 'buyer@example.test', 'phone' => '', 'address' => 'Dubai', 'tax_id' => '', 'credit_cents' => 1000000, 'terms_days' => 30, 'created_at' => now(), 'updated_at' => now()], ['name' => 'Material Supply House · demo', 'kind' => 'supplier', 'email' => 'supplier@example.test', 'phone' => '', 'address' => 'UAE', 'tax_id' => '', 'credit_cents' => 0, 'terms_days' => 30, 'created_at' => now(), 'updated_at' => now()]]);
        });
    }
}
