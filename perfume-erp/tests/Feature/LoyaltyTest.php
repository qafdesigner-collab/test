<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\PerfumeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class LoyaltyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PerfumeSeeder::class);
        $this->actingAs(User::factory()->create(['role' => 'owner']));
        foreach (['loyalty_enabled' => '1', 'loyalty_points_per_aed' => '1', 'loyalty_point_value_fils' => '5'] as $key => $value) {
            DB::table('settings')->updateOrInsert(['key' => $key], ['value' => $value]);
        }
        DB::table('contacts')->where('id', 1)->update(['credit_cents' => 100000000]);
        $this->postOnce('/api/shifts', ['action' => 'open', 'amount' => '0'])->assertOk();
    }

    private function postOnce(string $url, array $data)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson($url, $data);
    }

    private function balance(): int
    {
        return $this->getJson('/api/contacts/1/loyalty')->assertOk()->json('balance');
    }

    private function sale(array $payments, string $qty = '1', ?int $contact = 1)
    {
        return $this->postOnce('/api/documents', ['kind' => 'Sale', 'contact_id' => $contact, 'location_id' => 1, 'lines' => [['product_id' => 1, 'quantity' => $qty]], 'payments' => $payments]);
    }

    public function test_points_are_earned_redeemed_and_validated(): void
    {
        $this->sale([['method' => 'Cash', 'amount' => '250.00']], '2')->assertOk();
        $this->assertSame(250, $this->balance());

        $this->sale([['method' => 'Points', 'amount' => '1.00'], ['method' => 'Cash', 'amount' => '124.00']], '1', null)->assertUnprocessable();
        $this->sale([['method' => 'Points', 'amount' => '1.02'], ['method' => 'Cash', 'amount' => '123.98']])->assertUnprocessable();
        $this->sale([['method' => 'Points', 'amount' => '12.55'], ['method' => 'Cash', 'amount' => '112.45']])->assertUnprocessable();

        $sale = $this->sale([['method' => 'Points', 'amount' => '12.50'], ['method' => 'Cash', 'amount' => '112.50']])->assertOk()->json();
        $this->assertSame(250 - 250 + 112, $this->balance());
        $this->getJson('/api/documents/'.$sale['id'])->assertJsonPath('loyalty.earned', 112)->assertJsonPath('loyalty.redeemed', 250);

        $month = $this->getJson('/api/profit-loss')->json('months')[(int) now()->format('n') - 1];
        $this->assertSame(1250, $month['expenses_cents']);

        DB::table('settings')->where('key', 'loyalty_enabled')->update(['value' => '0']);
        $this->sale([['method' => 'Points', 'amount' => '0.05'], ['method' => 'Cash', 'amount' => '124.95']])->assertUnprocessable();
    }

    public function test_returns_take_back_earned_points_and_give_back_used_points_first(): void
    {
        $this->sale([['method' => 'Cash', 'amount' => '500.00']], '4')->assertOk();
        $this->assertSame(500, $this->balance());

        $sale = $this->sale([['method' => 'Points', 'amount' => '25.00'], ['method' => 'Cash', 'amount' => '225.00']], '2')->assertOk()->json();
        $this->assertSame(500 - 500 + 225, $this->balance());

        $line = DB::table('document_lines')->where('document_id', $sale['id'])->first();
        $partial = $this->postOnce('/api/documents/'.$sale['id'], ['action' => 'return', 'condition' => 'Restock', 'refund_method' => 'Cash', 'lines' => [['line_id' => $line->id, 'quantity' => '1']]])->assertOk()->json();
        $this->assertSame(10000, $partial['refund_cents']);
        $this->assertSame(2500, $partial['points_restored_cents']);
        $this->assertSame(225 - 112 + 500, $this->balance());

        $other = $this->sale([['method' => 'Points', 'amount' => '10.00'], ['method' => 'Card', 'amount' => '115.00']])->assertOk()->json();
        $before = $this->balance();
        $full = $this->postOnce('/api/documents/'.$other['id'], ['action' => 'return', 'condition' => 'Restock'])->assertOk()->json();
        $this->assertSame(11500, $full['refund_cents']);
        $this->assertSame($before - 115 + 200, $this->balance());
    }
}
