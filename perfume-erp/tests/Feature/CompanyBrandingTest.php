<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\PerfumeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CompanyBrandingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->seed(PerfumeSeeder::class);
    }

    private function company(array $extra = []): array
    {
        return $extra + ['company_name' => 'Noor Perfumes', 'currency' => 'AED', 'address' => '', 'phone' => '', 'email' => 'noor@example.test', 'tax_id' => ''];
    }

    public function test_manager_uploads_replaces_and_removes_logo(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'manager']));
        $this->post('/api/settings/logo', ['logo' => UploadedFile::fake()->image('logo.png', 300, 120)], ['Accept' => 'application/json'])->assertOk();
        $first = DB::table('settings')->where('key', 'logo_path')->value('value');
        Storage::disk('local')->assertExists($first);
        $this->get('/media/logo')->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');

        $this->post('/api/settings/logo', ['logo' => UploadedFile::fake()->image('new.jpg', 200, 200)], ['Accept' => 'application/json'])->assertOk();
        Storage::disk('local')->assertMissing($first);

        $this->postJson('/api/settings/logo', ['remove' => true])->assertOk()->assertJsonPath('logo', null);
        $this->get('/media/logo')->assertNotFound();
    }

    public function test_logo_rejects_svg_and_non_managers(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'manager']));
        $svg = UploadedFile::fake()->createWithContent('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        $this->post('/api/settings/logo', ['logo' => $svg], ['Accept' => 'application/json'])->assertUnprocessable();

        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->post('/api/settings/logo', ['logo' => UploadedFile::fake()->image('logo.png')], ['Accept' => 'application/json'])->assertForbidden();
    }

    public function test_brand_colour_and_invoice_footer_are_validated_and_saved(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'owner']));
        $this->postJson('/api/settings', $this->company(['brand_color' => 'red; background:url(x)']))->assertUnprocessable()->assertJsonValidationErrors('brand_color');
        $this->postJson('/api/settings', $this->company(['brand_color' => '#8a2c3b', 'invoice_footer' => 'Bank: Example Bank']))->assertOk();

        $settings = $this->getJson('/api/bootstrap')->json('settings');
        $this->assertSame('#8a2c3b', $settings['brand_color']);
        $this->assertSame('Bank: Example Bank', $settings['invoice_footer']);
        $this->post('/logout');
        $this->get('/login')->assertOk()->assertSee('--accent:#8a2c3b', false)->assertSee('Noor Perfumes');
    }
}
