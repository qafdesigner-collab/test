<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\UpdatePackage;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;
use ZipArchive;

class UpdatePackageTest extends TestCase
{
    use DatabaseMigrations;

    private string $root;

    protected function setUp(): void
    {
        parent::setUp();
        $this->root = sys_get_temp_dir().'/erp-update-'.bin2hex(random_bytes(4));
        mkdir($this->root.'/public', 0755, true);
        file_put_contents($this->root.'/.env', 'APP_KEY=keep-me');
        mkdir($this->root.'/storage', 0755, true);
        file_put_contents($this->root.'/storage/keep.txt', 'data');
        config(['erp.update_root' => $this->root]);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->root);
        parent::tearDown();
    }

    /** @param array<string, string> $extra */
    private function package(string $version, array $extra = []): string
    {
        $path = $this->root.'-'.bin2hex(random_bytes(3)).'.zip';
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE);
        foreach (['perfume-erp/artisan' => '#!/usr/bin/env php', 'perfume-erp/vendor/autoload.php' => '<?php', 'perfume-erp/public/index.php' => '<?php // new', 'perfume-erp/config/erp.php' => "<?php\n\$version = '{$version}';\n", 'perfume-erp/app/New.php' => '<?php // added', 'perfume-erp/.env' => 'APP_KEY=overwritten', 'perfume-erp/storage/keep.txt' => 'overwritten'] + $extra as $name => $content) {
            $zip->addFromString($name, $content);
        }
        $zip->close();

        return $path;
    }

    public function test_package_is_checked_and_installed_without_touching_env_or_storage(): void
    {
        $this->assertSame('9.9.9', UpdatePackage::inspect($this->package('9.9.9'))['version']);
        $this->assertGreaterThan(0, UpdatePackage::install($this->package('9.9.9')));
        $this->assertSame('<?php // added', file_get_contents($this->root.'/app/New.php'));
        $this->assertSame('<?php // new', file_get_contents($this->root.'/public/index.php'));
        $this->assertSame('APP_KEY=keep-me', file_get_contents($this->root.'/.env'));
        $this->assertSame('data', file_get_contents($this->root.'/storage/keep.txt'));
    }

    public function test_bad_packages_are_refused_before_anything_is_written(): void
    {
        foreach ([
            $this->package('0.0.1'),
            $this->package('9.9.9', ['perfume-erp/../../evil.php' => 'x']),
            $this->package('9.9.9', ['other-folder/evil.php' => 'x']),
        ] as $bad) {
            try {
                UpdatePackage::install($bad);
                $this->fail('A bad package was installed.');
            } catch (ValidationException) {
                $this->assertFileDoesNotExist($this->root.'/app/New.php');
            }
        }
    }

    public function test_owner_uploads_in_pieces_and_installs_with_a_backup_first(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'manager']));
        $this->postJson('/api/system/package', ['action' => 'start', 'password' => 'password', 'size' => 10])->assertForbidden();

        $this->actingAs(User::factory()->create(['role' => 'owner']));
        $zip = file_get_contents($this->package('9.9.9'));
        $this->postJson('/api/system/package', ['action' => 'start', 'password' => 'wrong', 'size' => strlen($zip)])->assertUnprocessable();
        $start = $this->postJson('/api/system/package', ['action' => 'start', 'password' => 'password', 'size' => strlen($zip)])->assertOk()->json();
        $half = intdiv(strlen($zip), 2);
        foreach ([substr($zip, 0, $half), substr($zip, $half)] as $i => $part) {
            $this->post('/api/system/package', ['action' => 'chunk', 'id' => $start['id'], 'index' => $i, 'chunk' => UploadedFile::fake()->createWithContent('part', $part)], ['Accept' => 'application/json'])->assertOk();
        }
        $done = $this->postJson('/api/system/package', ['action' => 'finish', 'id' => $start['id']])->assertOk()->json();
        $this->assertSame('9.9.9', $done['version']);
        $this->assertFileExists(storage_path('app/backups/'.$done['backup']));
        unlink(storage_path('app/backups/'.$done['backup']));
        $this->assertFileExists($this->root.'/app/New.php');
        $this->assertSame([], glob(storage_path('app/updates/*.zip')));
        $this->postJson('/api/system/package', ['action' => 'finish', 'id' => $start['id']])->assertStatus(409);
    }

    public function test_only_the_owner_can_see_the_version(): void
    {
        $version = config('erp.version');
        $this->get('/login')->assertOk()->assertDontSee($version);
        $this->actingAs(User::factory()->create(['role' => 'manager']));
        $this->get('/')->assertOk()->assertDontSee($version);
        $this->getJson('/api/bootstrap')->assertJson(['version' => null])->assertJsonMissing(['build' => $version]);
        $this->actingAs(User::factory()->create(['role' => 'owner']));
        $this->getJson('/api/bootstrap')->assertJson(['version' => $version]);
    }
}
