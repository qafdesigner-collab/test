<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\PerfumeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class ExpensesTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PerfumeSeeder::class);
        $this->manager = User::factory()->create(['role' => 'manager']);
        $this->actingAs($this->manager);
    }

    private function expense(array $data)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/expenses', $data + ['spent_on' => now()->toDateString(), 'category' => 'Rent', 'description' => 'Shop rent', 'amount' => '1000.00', 'method' => 'Bank']);
    }

    public function test_expenses_are_totalled_by_month_and_category_and_voids_drop_out(): void
    {
        $rent = $this->expense(['tax' => '47.62'])->assertOk()->json();
        $this->assertStringStartsWith('EXP-', $rent['number']);
        $this->expense(['category' => 'Utilities', 'description' => 'DEWA', 'amount' => '250.50'])->assertOk();
        $this->expense(['spent_on' => now()->subMonthNoOverflow()->startOfMonth()->toDateString(), 'amount' => '999'])->assertOk();

        $month = $this->getJson('/api/expenses')->assertOk();
        $month->assertJsonPath('total_cents', 125050)->assertJsonPath('tax_cents', 4762)->assertJsonPath('by_category.0.category', 'Rent');

        $this->postJson('/api/expenses/'.$rent['id'].'/void', ['reason' => 'Entered twice'])->assertOk();
        $this->postJson('/api/expenses/'.$rent['id'].'/void', ['reason' => 'Again'])->assertUnprocessable();
        $this->getJson('/api/expenses')->assertJsonPath('total_cents', 25050)->assertJsonCount(2, 'expenses');
        $this->getJson('/api/expenses?month='.now()->subMonthNoOverflow()->format('Y-m'))->assertJsonPath('total_cents', 99900);
    }

    public function test_expense_validation_and_permissions(): void
    {
        $this->expense(['amount' => '0'])->assertUnprocessable();
        $this->expense(['tax' => '2000'])->assertUnprocessable();
        $this->expense(['spent_on' => now()->addDay()->toDateString()])->assertUnprocessable();
        $this->expense(['method' => 'Card', 'from_drawer' => true])->assertUnprocessable();

        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->expense([])->assertForbidden();
        $this->getJson('/api/expenses')->assertForbidden();
    }

    public function test_cash_paid_from_the_drawer_reduces_expected_shift_cash(): void
    {
        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/shifts', ['action' => 'open', 'amount' => '300.00'])->assertOk();
        $this->expense(['category' => 'Transport & delivery', 'description' => 'Courier', 'amount' => '45.00', 'method' => 'Cash', 'from_drawer' => true])->assertOk();
        $this->getJson('/api/shifts')->assertJsonPath('shifts.0.expected_cents', 25500);
    }
}
