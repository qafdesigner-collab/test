<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\PerfumeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class ReceivablesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PerfumeSeeder::class);
        $this->actingAs(User::factory()->create(['role' => 'accountant']));
        DB::table('contacts')->where('id', 1)->update(['credit_cents' => 10000000]);
    }

    private function postOnce(string $url, array $data)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson($url, $data);
    }

    private function invoice(string $qty, int $daysAgo, ?int $dueInDays): int
    {
        $id = $this->postOnce('/api/documents', ['kind' => 'Invoice', 'contact_id' => 1, 'location_id' => 1, 'method' => 'Credit', 'paid' => '0', 'lines' => [['product_id' => 1, 'quantity' => $qty]]])->assertOk()->json('id');
        $created = now()->subDays($daysAgo);
        DB::table('documents')->where('id', $id)->update(['created_at' => $created, 'due_date' => $dueInDays === null ? null : $created->copy()->addDays($dueInDays)->toDateString()]);

        return $id;
    }

    public function test_ageing_buckets_and_statement_balance_agree(): void
    {
        $current = $this->invoice('1', 5, 30);
        $late45 = $this->invoice('2', 75, 30);
        $late120 = $this->invoice('1', 120, null);
        $this->postOnce('/api/documents/'.$late45, ['action' => 'payment', 'amount' => '50.00', 'method' => 'Bank'])->assertOk();
        $line = DB::table('document_lines')->where('document_id', $late120)->first();
        $this->postOnce('/api/documents/'.$current, ['action' => 'return', 'condition' => 'Restock', 'lines' => [['line_id' => DB::table('document_lines')->where('document_id', $current)->value('id'), 'quantity' => '1']]])->assertOk();

        $ageing = $this->getJson('/api/receivables')->assertOk()->json();
        $this->assertSame(0, $ageing['totals']['current']);
        $this->assertSame(20000, $ageing['totals']['days_31_60']);
        $this->assertSame(12500, $ageing['totals']['days_over_90']);
        $this->assertSame(32500, $ageing['customers'][0]['balance_cents']);
        $this->assertSame(120, $ageing['customers'][0]['oldest_days']);

        $all = $this->getJson('/api/customers/1/statement?from='.now()->subYear()->toDateString().'&to='.now()->toDateString())->assertOk()->json();
        $this->assertSame(0, $all['opening_cents']);
        $this->assertSame(32500, $all['closing_cents']);
        $this->assertSame(['Invoice', 'Invoice', 'Invoice', 'Return', 'Payment'], array_column($all['lines'], 'type'));

        $recent = $this->getJson('/api/customers/1/statement?from='.now()->subDays(30)->toDateString().'&to='.now()->toDateString())->assertOk()->json();
        $this->assertSame(37500, $recent['opening_cents']);
        $this->assertSame(32500, $recent['closing_cents']);

        $this->getJson('/api/customers/2/statement')->assertNotFound();
        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->getJson('/api/receivables')->assertForbidden();
    }
}
