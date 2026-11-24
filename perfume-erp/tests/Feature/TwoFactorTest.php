<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\TwoFactor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TwoFactorTest extends TestCase
{
    use RefreshDatabase;

    private function enrol(User $user): array
    {
        $this->actingAs($user);
        $setup = $this->postJson('/api/two-factor', ['action' => 'setup', 'password' => 'password'])->assertOk()->json();
        $step = intdiv(time(), 30);
        $codes = $this->postJson('/api/two-factor', ['action' => 'confirm', 'code' => TwoFactor::code($setup['secret'], $step - 1)])->assertOk()->json('recovery_codes');
        auth()->logout();
        $this->flushSession();

        return ['secret' => $setup['secret'], 'codes' => $codes];
    }

    public function test_codes_match_the_rfc_6238_reference_values(): void
    {
        $secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // base32 of "12345678901234567890"
        $this->assertSame('287082', TwoFactor::code($secret, intdiv(59, 30)));
        $this->assertSame('081804', TwoFactor::code($secret, intdiv(1111111109, 30)));
        $this->assertSame(intdiv(1111111109, 30), TwoFactor::matchStep($secret, '081 804', null, 1111111109 + 25));
        $this->assertNull(TwoFactor::matchStep($secret, '081804', intdiv(1111111109, 30), 1111111109));
    }

    public function test_sign_in_asks_for_a_code_after_set_up(): void
    {
        $owner = User::factory()->create(['role' => 'owner', 'email' => 'owner@example.test']);
        $two = $this->enrol($owner);
        $stored = DB::table('users')->where('id', $owner->id)->first();
        $this->assertStringNotContainsString($two['secret'], $stored->two_factor_secret);
        $this->assertCount(8, $two['codes']);

        $this->post('/login', ['email' => 'owner@example.test', 'password' => 'password'])->assertRedirect('/login/two-factor');
        $this->assertGuest();
        $this->get('/login/two-factor')->assertOk()->assertSee('authenticator app');
        $this->post('/login/two-factor', ['code' => '000000'])->assertSessionHasErrors('code');
        $this->assertGuest();
        $this->post('/login/two-factor', ['code' => TwoFactor::code($two['secret'], intdiv(time(), 30))])->assertRedirect('/');
        $this->assertAuthenticatedAs($owner);
    }

    public function test_a_recovery_code_works_once(): void
    {
        $manager = User::factory()->create(['role' => 'manager', 'email' => 'manager@example.test']);
        $two = $this->enrol($manager);
        foreach ([true, false] as $works) {
            $this->post('/login', ['email' => 'manager@example.test', 'password' => 'password']);
            $response = $this->post('/login/two-factor', ['code' => strtoupper($two['codes'][0])]);
            if ($works) {
                $response->assertRedirect('/');
                $this->assertAuthenticatedAs($manager);
                $this->post('/logout');
            } else {
                $response->assertSessionHasErrors('code');
                $this->assertGuest();
            }
        }
        $this->actingAs($manager)->getJson('/api/two-factor')->assertJson(['enabled' => true, 'recovery_remaining' => 7]);
    }

    public function test_the_challenge_expires_and_cannot_be_skipped(): void
    {
        $owner = User::factory()->create(['role' => 'owner', 'email' => 'owner@example.test']);
        $this->enrol($owner);
        $this->get('/login/two-factor')->assertRedirect('/login');
        $this->post('/login', ['email' => 'owner@example.test', 'password' => 'password']);
        $this->get('/')->assertRedirect('/login');
        $this->travel(6)->minutes();
        $this->get('/login/two-factor')->assertRedirect('/login');
    }

    public function test_only_owner_and_managers_can_set_it_up_and_the_owner_can_reset_it(): void
    {
        $cashier = User::factory()->create(['role' => 'cashier']);
        $this->actingAs($cashier)->getJson('/api/two-factor')->assertJson(['available' => false]);
        $this->postJson('/api/two-factor', ['action' => 'setup', 'password' => 'password'])->assertForbidden();

        $manager = User::factory()->create(['role' => 'manager']);
        $this->enrol($manager);
        $this->actingAs($manager)->postJson('/api/two-factor', ['action' => 'setup', 'password' => 'wrong-password'])->assertUnprocessable();
        $this->postJson('/api/users/'.$cashier->id.'/two-factor-reset')->assertForbidden();

        $owner = User::factory()->create(['role' => 'owner']);
        $this->actingAs($owner)->getJson('/api/users')->assertJsonFragment(['id' => $manager->id, 'two_factor' => 1]);
        $this->postJson('/api/users/'.$manager->id.'/two-factor-reset')->assertOk();
        $this->assertNull(DB::table('users')->where('id', $manager->id)->value('two_factor_secret'));
        $this->post('/logout');
        $this->post('/login', ['email' => $manager->email, 'password' => 'password'])->assertRedirect('/');
    }

    public function test_switching_off_needs_the_password(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $this->enrol($owner);
        $this->actingAs($owner);
        $this->postJson('/api/two-factor', ['action' => 'recovery', 'password' => 'password'])->assertOk()->assertJsonCount(8, 'recovery_codes');
        $this->postJson('/api/two-factor', ['action' => 'disable'])->assertUnprocessable();
        $this->postJson('/api/two-factor', ['action' => 'disable', 'password' => 'password'])->assertOk();
        $this->getJson('/api/two-factor')->assertJson(['enabled' => false]);
    }

    public function test_the_emergency_command_switches_it_off(): void
    {
        $owner = User::factory()->create(['role' => 'owner', 'email' => 'owner@example.test']);
        $this->enrol($owner);
        $this->artisan('erp:two-factor-off', ['email' => 'nobody@example.test'])->assertExitCode(1);
        $this->artisan('erp:two-factor-off', ['email' => 'owner@example.test'])->assertExitCode(0);
        $this->post('/login', ['email' => 'owner@example.test', 'password' => 'password'])->assertRedirect('/');
    }
}
