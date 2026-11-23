<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\InspirationLibrarySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class InspirationLibraryTest extends TestCase
{
    use RefreshDatabase;

    public function test_library_seeds_once_and_preserves_staff_edits(): void
    {
        $this->seed(InspirationLibrarySeeder::class);
        $count = DB::table('references')->count();
        $this->assertGreaterThan(100, $count);
        $this->assertSame($count, DB::table('references')->where('library', true)->count());

        DB::table('references')->where('brand', 'Creed')->where('name', 'Aventus')->update(['notes' => 'Our own panel notes']);
        $this->seed(InspirationLibrarySeeder::class);

        $this->assertSame($count, DB::table('references')->count());
        $this->assertSame('Our own panel notes', DB::table('references')->where('brand', 'Creed')->where('name', 'Aventus')->value('notes'));
    }

    public function test_staff_can_add_reference_with_profile_but_not_duplicate(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'manager']));
        $data = ['brand' => 'House Example', 'name' => 'Example Oud', 'gender' => 'Unisex', 'family' => 'Woody', 'notes' => 'Oud, rose'];

        $this->postJson('/api/references', $data)->assertOk();
        $this->postJson('/api/references', $data)->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->postJson('/api/references', ['gender' => 'Other'] + $data)->assertUnprocessable()->assertJsonValidationErrors('gender');

        $reference = collect($this->getJson('/api/references')->json('references'))->firstWhere('name', 'Example Oud');
        $this->assertSame('Woody', $reference['family']);
    }

    public function test_cashier_cannot_add_references(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->postJson('/api/references', ['brand' => 'A', 'name' => 'B'])->assertForbidden();
    }
}
