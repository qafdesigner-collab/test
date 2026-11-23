<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\PerfumeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class StockControlTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PerfumeSeeder::class);
        $this->actingAs(User::factory()->create(['role' => 'warehouse']));
    }

    private function postOnce(string $url, array $data)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson($url, $data);
    }

    private function quantity(int $product, string $lot): int
    {
        return (int) DB::table('balances')->where(['product_id' => $product, 'location_id' => 1, 'lot' => $lot])->value('quantity_milli');
    }

    public function test_lot_expiry_is_set_cleared_and_shown_on_the_dashboard(): void
    {
        $this->postJson('/api/lots/expiry', ['product_id' => 1, 'lot' => 'NO-SUCH-LOT', 'expires_on' => '2027-01-01'])->assertNotFound();
        $this->postJson('/api/lots/expiry', ['product_id' => 1, 'lot' => 'DEMO-OPENING', 'expires_on' => now()->addDays(10)->toDateString()])->assertOk();

        $balance = collect($this->getJson('/api/inventory')->json('balances'))->first(fn ($b) => $b['product_id'] === 1 && $b['lot'] === 'DEMO-OPENING');
        $this->assertSame(now()->addDays(10)->toDateString(), $balance['expires_on']);
        $this->assertSame('DEMO-OPENING', $this->getJson('/api/dashboard')->json('expiring.0.lot'));

        $this->postJson('/api/lots/expiry', ['product_id' => 1, 'lot' => 'DEMO-OPENING', 'expires_on' => null])->assertOk();
        $this->assertSame([], $this->getJson('/api/dashboard')->json('expiring'));

        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->postJson('/api/lots/expiry', ['product_id' => 1, 'lot' => 'DEMO-OPENING', 'expires_on' => '2027-01-01'])->assertForbidden();
    }

    public function test_purchase_order_receipt_records_lot_expiry(): void
    {
        $po = $this->postOnce('/api/documents', ['kind' => 'PurchaseOrder', 'contact_id' => 2, 'location_id' => 1, 'method' => 'Credit', 'paid' => '0', 'lines' => [['product_id' => 7, 'quantity' => '5']]])->assertOk()->json();
        $line = DB::table('document_lines')->where('document_id', $po['id'])->first();
        $receipt = $this->postOnce('/api/documents/'.$po['id'], ['action' => 'receive', 'location_id' => 1, 'lines' => [['line_id' => $line->id, 'quantity' => '5', 'expires_on' => '2028-06-30']]])->assertOk()->json();

        $this->assertSame('2028-06-30', DB::table('lot_details')->where(['product_id' => 7, 'lot' => $receipt['number']])->value('expires_on'));
    }

    public function test_stock_count_adjusts_gains_and_losses_and_records_the_count(): void
    {
        $a = $this->quantity(1, 'DEMO-OPENING');
        $b = $this->quantity(7, 'DEMO-OPENING');
        $lines = [
            ['product_id' => 1, 'lot' => 'DEMO-OPENING', 'expected' => number_format($a / 1000, 3, '.', ''), 'counted' => number_format(($a - 2000) / 1000, 3, '.', '')],
            ['product_id' => 7, 'lot' => 'DEMO-OPENING', 'expected' => number_format($b / 1000, 3, '.', ''), 'counted' => number_format(($b + 250) / 1000, 3, '.', '')],
        ];

        $count = $this->postOnce('/api/stock-counts', ['location_id' => 1, 'notes' => 'Month end', 'lines' => $lines])->assertOk()->json();
        $this->assertSame(2, $count['adjustments']);
        $this->assertSame($a - 2000, $this->quantity(1, 'DEMO-OPENING'));
        $this->assertSame($b + 250, $this->quantity(7, 'DEMO-OPENING'));
        $this->assertSame(2, DB::table('movements')->where('source', $count['number'])->count());
        $this->assertSame(-2000, (int) DB::table('stock_count_lines')->where(['stock_count_id' => $count['id'], 'product_id' => 1])->value('difference_milli'));
        $this->getJson('/api/stock-counts')->assertJsonPath('counts.0.number', $count['number']);
    }

    public function test_stock_count_is_rejected_entirely_when_stock_moved_meanwhile(): void
    {
        $a = $this->quantity(1, 'DEMO-OPENING');
        $b = $this->quantity(7, 'DEMO-OPENING');
        $lines = [
            ['product_id' => 7, 'lot' => 'DEMO-OPENING', 'expected' => number_format($b / 1000, 3, '.', ''), 'counted' => '1.000'],
            ['product_id' => 1, 'lot' => 'DEMO-OPENING', 'expected' => number_format(($a + 1000) / 1000, 3, '.', ''), 'counted' => '1'],
        ];
        $this->postOnce('/api/stock-counts', ['location_id' => 1, 'lines' => $lines])->assertUnprocessable()->assertJsonFragment(['Stock moved while you were counting. Reload and recount: Ocean Breeze · DEMO-OPENING']);
        $this->assertSame($b, $this->quantity(7, 'DEMO-OPENING'));
        $this->assertSame(0, DB::table('stock_counts')->count());

        $lines = [['product_id' => 1, 'lot' => 'DEMO-OPENING', 'expected' => number_format($a / 1000, 3, '.', ''), 'counted' => '1.5']];
        $this->postOnce('/api/stock-counts', ['location_id' => 1, 'lines' => $lines])->assertUnprocessable();
    }
}
