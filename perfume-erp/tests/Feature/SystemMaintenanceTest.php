<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Backup;
use Database\Seeders\PerfumeSeeder;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use ZipArchive;

class SystemMaintenanceTest extends TestCase
{
    use DatabaseMigrations;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create(['role' => 'owner', 'password' => 'owner-password-123']);
        $this->seed(PerfumeSeeder::class);
    }

    public function test_only_owner_sees_system_status(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'manager']))->getJson('/api/system')->assertForbidden();
        $this->actingAs($this->owner)->getJson('/api/system')->assertOk()
            ->assertJsonPath('version', config('erp.version'))
            ->assertJsonPath('pending_updates', []);
    }

    public function test_update_and_backup_require_the_owner_password(): void
    {
        $this->actingAs($this->owner);
        $this->postJson('/api/system/update', ['password' => 'wrong'])->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->postJson('/api/system/backup', ['password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/api/system/update', ['password' => 'owner-password-123'])->assertOk()->assertJsonPath('applied', []);
        $this->assertDatabaseHas('audit', ['action' => 'system.update']);
    }

    public function test_backup_download_contains_database_and_private_files(): void
    {
        $marker = storage_path('app/private/backup-test-'.uniqid().'.txt');
        @mkdir(dirname($marker), 0755, true);
        file_put_contents($marker, 'private file');

        try {
            $response = $this->actingAs($this->owner)->post('/api/system/backup', ['password' => 'owner-password-123'], ['Accept' => 'application/json']);
            $response->assertOk()->assertDownload();
            $zip = new ZipArchive;
            $this->assertTrue($zip->open($response->getFile()->getPathname()));
            $database = DB::connection()->getDriverName() === 'sqlite' ? 'database.sqlite' : 'database.sql';
            $this->assertNotFalse($zip->locateName($database));
            $this->assertNotFalse($zip->locateName('RECOVERY.txt'));
            $this->assertNotFalse($zip->locateName('private/'.basename($marker)));
            $this->assertFalse($zip->locateName('private/installed.lock'));
            $zip->close();
        } finally {
            @unlink($marker);
        }
        $this->assertDatabaseHas('audit', ['action' => 'system.backup_download']);
    }

    public function test_automatic_backups_keep_only_the_newest(): void
    {
        $directory = storage_path('app/backups');
        @mkdir($directory, 0700, true);
        $existing = glob($directory.'/erp-*.zip') ?: [];
        foreach (['2020-01-01-000000', '2020-01-02-000000'] as $stamp) {
            touch($directory."/erp-{$stamp}.zip");
        }
        try {
            $created = Backup::rotate(2);
            $this->assertFileExists($created);
            $this->assertFileDoesNotExist($directory.'/erp-2020-01-01-000000.zip');
            $this->assertCount(2, glob($directory.'/erp-*.zip'));
        } finally {
            foreach (array_diff(glob($directory.'/erp-*.zip') ?: [], $existing) as $file) {
                @unlink($file);
            }
        }
    }
}
