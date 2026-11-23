<?php

namespace Tests\Feature;

use App\Http\Controllers\ArtworkPortalController;
use App\Models\User;
use Database\Seeders\PerfumeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ArtworkPortalTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private int $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create(['role' => 'owner']);
        $this->seed(PerfumeSeeder::class);
        Storage::fake('local');
        DB::table('contacts')->where('id', 1)->update(['phone' => '+971 50 123 4567']);
        $this->project = DB::table('projects')->insertGetId(['name' => 'Customer packaging', 'type' => 'Packaging', 'contact_id' => 1, 'user_id' => $this->owner->id, 'brief' => 'Confidential internal brief', 'charge_cents' => 99000, 'cost_cents' => 10000, 'created_at' => now(), 'updated_at' => now()]);
        $this->actingAs($this->owner);
    }

    private function share(bool $upload = true): string
    {
        $result = $this->postJson('/api/projects/'.$this->project.'/customer-link', ['action' => 'create', 'allow_upload' => $upload])->assertOk()->json('link');
        $expectedPhone = ArtworkPortalController::phone(DB::table('contacts')->where('id', 1)->value('phone'));
        $this->assertStringStartsWith('https://wa.me/'.$expectedPhone.'?text=', $result['whatsapp_url']);
        $this->assertStringContainsString(rawurlencode($result['url']), $result['whatsapp_url']);
        Auth::forgetGuards();

        return parse_url($result['url'], PHP_URL_PATH);
    }

    private function mockup(): int
    {
        $this->actingAs($this->owner);

        return $this->post('/api/projects/'.$this->project.'/artwork', ['file' => UploadedFile::fake()->image('mockup.png')], ['Accept' => 'application/json'])->assertOk()->json('id');
    }

    private function decision(int $id): array
    {
        return ['artwork_id' => $id, 'decision' => 'approve', 'name' => 'Customer Reviewer', 'phone' => '+971501234567', 'consent' => true];
    }

    public function test_guest_view_is_scoped_and_approval_records_exact_version(): void
    {
        $id = $this->mockup();
        $path = $this->share();
        $this->get($path)->assertOk();
        $data = $this->getJson($path.'/data')->assertOk()->json();
        $this->assertArrayNotHasKey('cost_cents', $data['project']);
        $this->assertArrayNotHasKey('brief', $data['project']);
        $this->get($path.'/files/'.$id)->assertOk();
        $this->get($path.'/files/999999')->assertNotFound();
        $this->getJson('/api/formulas')->assertUnauthorized();
        $this->postJson($path.'/decision', $this->decision($id))->assertOk();
        $this->postJson($path.'/decision', $this->decision($id))->assertOk();
        $this->assertDatabaseCount('approvals', 1);
        $this->assertDatabaseHas('approvals', ['artwork_id' => $id, 'user_id' => null, 'source' => 'customer', 'customer_phone' => '971501234567', 'customer_name' => 'Customer Reviewer']);
        $this->assertDatabaseHas('projects', ['id' => $this->project, 'status' => 'Approved', 'approved_artwork_id' => $id]);
    }

    public function test_wrong_phone_missing_consent_and_stale_version_are_rejected(): void
    {
        $old = $this->mockup();
        $path = $this->share();
        $this->postJson($path.'/decision', array_replace($this->decision($old), ['phone' => '+971509999999']))->assertUnprocessable();
        $this->postJson($path.'/decision', array_replace($this->decision($old), ['consent' => false]))->assertUnprocessable();
        $this->mockup();
        Auth::forgetGuards();
        $this->postJson($path.'/decision', $this->decision($old))->assertConflict();
        $this->assertDatabaseCount('approvals', 0);
    }

    public function test_customer_upload_invalidates_approval_and_packaging_readiness(): void
    {
        $id = $this->mockup();
        DB::table('projects')->where('id', $this->project)->update(['approved_artwork_id' => $id, 'status' => 'Approved', 'workflow_events' => json_encode([['stage' => 'packaging_ready', 'at' => now()->toISOString()]])]);
        $path = $this->share();
        $new = $this->post($path.'/upload', ['file' => UploadedFile::fake()->image('customer-artwork.png'), 'name' => 'Customer', 'phone' => '+971501234567'], ['Accept' => 'application/json'])->assertOk()->json('id');
        $this->assertDatabaseHas('artworks', ['id' => $new, 'version' => 2, 'source' => 'customer', 'user_id' => null]);
        $p = DB::table('projects')->find($this->project);
        $this->assertNull($p->approved_artwork_id);
        $this->assertSame('Review', $p->status);
        $this->assertSame('packaging_superseded', json_decode($p->workflow_events, true)[0]['stage']);
    }

    public function test_links_can_expire_revoke_rotate_and_close_on_phone_change(): void
    {
        $path = $this->share();
        $this->actingAs($this->owner)->postJson('/api/projects/'.$this->project.'/customer-link', ['action' => 'revoke'])->assertOk();
        Auth::forgetGuards();
        $this->get($path)->assertNotFound();
        $this->actingAs($this->owner);
        $path = $this->share();
        $this->actingAs($this->owner)->postJson('/api/contacts/1', ['name' => 'Updated customer', 'phone' => '+971509999999'])->assertOk();
        Auth::forgetGuards();
        $this->get($path)->assertNotFound();
        $this->actingAs($this->owner);
        $path = $this->share();
        DB::table('artwork_links')->update(['expires_at' => now()->subDay()]);
        $this->get($path)->assertNotFound();
    }

    public function test_review_only_and_delivered_links_reject_uploads_and_mutations(): void
    {
        $id = $this->mockup();
        $path = $this->share(false);
        $this->post($path.'/upload', ['file' => UploadedFile::fake()->image('art.png'), 'name' => 'Customer', 'phone' => '+971501234567'], ['Accept' => 'application/json'])->assertForbidden();
        DB::table('projects')->where('id', $this->project)->update(['status' => 'Delivered']);
        $this->postJson($path.'/decision', $this->decision($id))->assertUnprocessable();
        $this->getJson($path.'/data')->assertOk()->assertJsonPath('allow_upload', false);
        $this->get('/artwork-review/'.str_repeat('a', 64))->assertNotFound();
    }

    public function test_unassigned_staff_and_missing_customer_phone_cannot_share(): void
    {
        DB::table('contacts')->where('id', 1)->update(['phone' => '']);
        $this->postJson('/api/projects/'.$this->project.'/customer-link', ['action' => 'create'])->assertUnprocessable();
        $this->actingAs(User::factory()->create(['role' => 'designer']))->getJson('/api/projects/'.$this->project.'/customer-link')->assertForbidden();
        $this->actingAs(User::factory()->create(['role' => 'cashier']))->postJson('/api/projects/'.$this->project.'/customer-link', ['action' => 'create'])->assertForbidden();
    }
}
