<?php

namespace Tests\Feature;

use App\Services\Installation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class WebInstallerTest extends TestCase
{
    private string $directory;

    private string $envFile;

    protected function setUp(): void
    {
        parent::setUp();
        $this->directory = sys_get_temp_dir().'/erp-install-'.uniqid();
        mkdir($this->directory);
        $this->envFile = $this->directory.'/.env';
        file_put_contents($this->envFile, "APP_NAME=Test\nDB_CONNECTION=sqlite\n# DB_HOST=127.0.0.1\n");
        touch($this->directory.'/database.sqlite');
        config(['database.connections.sqlite.database' => $this->directory.'/database.sqlite']);
        DB::purge('sqlite');
        config(['erp.install_check' => true, 'erp.install_lock' => $this->directory.'/installed.lock', 'erp.install_code' => $this->directory.'/install-code.txt', 'erp.env_file' => $this->envFile, 'erp.sqlite_path' => $this->directory.'/database.sqlite']);
    }

    protected function tearDown(): void
    {
        DB::purge('sqlite');
        array_map('unlink', array_filter(glob($this->directory.'/{,.}*', GLOB_BRACE) ?: [], 'is_file'));
        @rmdir($this->directory);
        parent::tearDown();
    }

    private function form(array $overrides = []): array
    {
        return $overrides + [
            'install_code' => Installation::code(), 'app_url' => 'https://erp.example.test', 'db_connection' => 'sqlite',
            'company_name' => 'Noor Perfumes', 'currency' => 'aed', 'name' => 'Owner Person', 'email' => 'Owner@Example.test',
            'password' => 'a-long-secure-password', 'password_confirmation' => 'a-long-secure-password', 'demo' => '1',
        ];
    }

    public function test_pages_redirect_to_installer_until_owner_exists(): void
    {
        $this->get('/login')->assertRedirect('/install');
        $this->get('/install')->assertOk()->assertSee('Set up your company workspace');
        $this->assertFileExists(config('erp.install_code'));
    }

    public function test_wrong_code_and_bad_input_change_nothing(): void
    {
        $this->post('/install', $this->form(['install_code' => 'WRONG000']))->assertSessionHasErrors('install_code');
        $this->post('/install', $this->form(['password_confirmation' => 'different-password']))->assertSessionHasErrors('password');
        $this->assertFalse(Schema::hasTable('users'));
        $this->assertFileDoesNotExist(config('erp.install_lock'));
        $this->assertStringNotContainsString('APP_URL', file_get_contents($this->envFile));
    }

    public function test_installation_creates_owner_library_demo_and_closes_itself(): void
    {
        $this->post('/install', $this->form())->assertRedirect('/login');

        $owner = DB::table('users')->first();
        $this->assertSame('owner@example.test', $owner->email);
        $this->assertSame('owner', $owner->role);
        $this->assertTrue(Hash::check('a-long-secure-password', $owner->password));
        $this->assertSame('Noor Perfumes', DB::table('settings')->where('key', 'company_name')->value('value'));
        $this->assertSame('AED', DB::table('settings')->where('key', 'currency')->value('value'));
        $this->assertGreaterThan(100, DB::table('references')->where('library', true)->count());
        $this->assertTrue(DB::table('products')->exists());
        $this->assertFileExists(config('erp.install_lock'));
        $this->assertFileDoesNotExist(config('erp.install_code'));
        $this->assertStringContainsString("APP_URL='https://erp.example.test'", file_get_contents($this->envFile));

        $this->get('/install')->assertNotFound();
        $this->post('/install', $this->form())->assertNotFound();
        $this->assertDatabaseCount('users', 1);
    }

    public function test_environment_values_are_quoted_and_unsafe_values_rejected(): void
    {
        Installation::writeEnvironment(['DB_PASSWORD' => 'p@ss $word#1', 'DB_HOST' => 'localhost'], $this->envFile);
        $content = file_get_contents($this->envFile);
        $this->assertStringContainsString("DB_PASSWORD='p@ss \$word#1'", $content);
        $this->assertStringContainsString("DB_HOST='localhost'", $content);
        $this->assertStringNotContainsString('# DB_HOST', $content);

        $this->expectException(\InvalidArgumentException::class);
        Installation::writeEnvironment(['DB_PASSWORD' => "it's"], $this->envFile);
    }
}
