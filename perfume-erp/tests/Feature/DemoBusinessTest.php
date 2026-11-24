<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DemoBusinessSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DemoBusinessTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_adds_a_consistent_demo_business_once(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $this->actingAs(User::factory()->create(['role' => 'manager']));
        $this->postJson('/api/system/demo', ['password' => 'password'])->assertForbidden();

        $this->actingAs($owner);
        $this->getJson('/api/system')->assertJson(['demo_available' => true]);
        $this->postJson('/api/system/demo', ['password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/api/system/demo', ['password' => 'password'])->assertOk();

        $this->assertGreaterThan(150, DB::table('documents')->where('kind', 'Sale')->count());
        $this->assertGreaterThan(5, DB::table('documents')->where('kind', 'Invoice')->count());
        $this->assertSame(0, DB::table('balances')->where('quantity_milli', '<', 0)->count());
        $this->assertSame(0, DB::table('shifts')->whereNull('closed_at')->count());
        $this->assertGreaterThanOrEqual(5, DB::table('batches')->where('status', 'Completed')->count());
        $this->assertGreaterThan(20, DB::table('expenses')->count());
        $this->assertSame('system.demo_added', DB::table('audit')->orderByDesc('id')->value('action'));
        $this->assertSame($owner->id, DB::table('audit')->orderByDesc('id')->value('user_id'));
        $this->assertLessThanOrEqual(now()->timestamp, strtotime((string) DB::table('documents')->max('created_at')));

        foreach (['dashboard', 'profit-loss', 'receivables', 'reorder', 'inventory', 'documents', 'shifts', 'batches', 'expenses', 'profitability'] as $page) {
            $this->getJson('/api/'.$page)->assertOk();
        }
        $this->getJson('/api/system')->assertJson(['demo_available' => false]);
        $this->postJson('/api/system/demo', ['password' => 'password'])->assertUnprocessable();
    }

    public function test_demo_refuses_a_real_catalogue(): void
    {
        User::factory()->create(['role' => 'owner']);
        DB::table('products')->insert(['sku' => 'MY-1', 'name' => 'My perfume', 'kind' => 'finished', 'unit' => 'bottle', 'price_cents' => 100, 'cost_cents' => 50, 'tax_bp' => 0, 'reorder_milli' => 0, 'families' => '[]', 'notes' => '[]', 'tags' => '[]', 'active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $this->expectException(\RuntimeException::class);
        (new DemoBusinessSeeder)->run();
    }
}
