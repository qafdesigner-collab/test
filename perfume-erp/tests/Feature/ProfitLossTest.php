<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\PerfumeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class ProfitLossTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PerfumeSeeder::class);
        $this->actingAs(User::factory()->create(['role' => 'accountant']));
    }

    private function postOnce(string $url, array $data)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson($url, $data);
    }

    public function test_monthly_profit_and_loss_combines_sales_returns_costs_and_expenses(): void
    {
        $sale = $this->postOnce('/api/documents', ['kind' => 'Invoice', 'contact_id' => 1, 'location_id' => 1, 'method' => 'Cash', 'paid' => '0', 'lines' => [['product_id' => 1, 'quantity' => '4']]])->assertOk()->json();
        $line = DB::table('document_lines')->where('document_id', $sale['id'])->first();
        $this->postOnce('/api/documents/'.$sale['id'], ['action' => 'return', 'condition' => 'Restock', 'lines' => [['line_id' => $line->id, 'quantity' => '1']]])->assertOk();
        $this->postOnce('/api/expenses', ['spent_on' => now()->toDateString(), 'category' => 'Rent', 'description' => 'Rent', 'amount' => '105.00', 'tax' => '5.00', 'method' => 'Bank'])->assertOk();
        $void = $this->postOnce('/api/expenses', ['spent_on' => now()->toDateString(), 'category' => 'Other', 'description' => 'Mistake', 'amount' => '999.00', 'method' => 'Bank'])->json();
        $this->postJson('/api/expenses/'.$void['id'].'/void', ['reason' => 'Mistake'])->assertOk();

        $cogs = (int) $line->cogs_cents - (int) DB::table('document_lines')->where('id', $line->id)->value('returned_cogs_cents');
        $report = $this->getJson('/api/profit-loss')->assertOk()->json();
        $month = $report['months'][(int) now()->format('n') - 1];
        $this->assertSame(37500, $month['revenue_cents']);
        $this->assertSame($cogs, $month['cogs_cents']);
        $this->assertSame(10000, $month['expenses_cents']);
        $this->assertSame(37500 - $cogs - 10000, $month['net_profit_cents']);
        $this->assertSame($month['net_profit_cents'], $report['totals']['net_profit_cents']);
        $this->assertSame([['category' => 'Rent', 'amount_cents' => 10000]], $report['categories']);

        $csv = $this->get('/api/profit-loss?csv=1')->assertOk()->getContent();
        $this->assertStringContainsString('month,revenue,cost_of_goods,gross_profit,expenses,net_profit', $csv);
        $this->assertStringContainsString(now()->format('Y-m').',375.00', $csv);
        $this->getJson('/api/profit-loss?year='.(now()->year - 1))->assertOk()->assertJsonPath('totals.revenue_cents', 0);
    }

    public function test_cashiers_cannot_see_profit_and_loss(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->getJson('/api/profit-loss')->assertForbidden();
    }
}
