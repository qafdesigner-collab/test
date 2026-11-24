<?php

namespace App\Http\Controllers;

use App\Services\Backup;
use App\Services\UpdatePackage;
use Database\Seeders\DemoBusinessSeeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class SystemController extends Controller
{
    /**
     * Version, database and pending updates for the owner's System panel.
     *
     * @return array<string, mixed>
     */
    public function status(): array
    {
        $this->ownerOnly();

        return [
            'version' => config('erp.version'),
            'php' => PHP_VERSION,
            'database' => DB::connection()->getDriverName(),
            'artisan' => base_path('artisan'),
            'pending_updates' => $this->pendingMigrations(),
            'backups' => Backup::automaticBackups(),
            'demo_available' => ! DB::table('documents')->exists(),
        ];
    }

    /**
     * Apply database updates after new files were uploaded.
     *
     * @return array<string, mixed>
     */
    public function update(Request $r): array
    {
        $this->ownerOnly();
        $this->confirmPassword($r);
        $pending = $this->pendingMigrations();
        Artisan::call('migrate', ['--force' => true]);
        Artisan::call('erp:library');
        $this->audit('system.update', 'database', ['applied' => $pending]);

        return ['applied' => $pending, 'pending_updates' => $this->pendingMigrations()];
    }

    /**
     * Upload an update package in 1 MB pieces (works with small PHP upload limits), then install it:
     * start (password) → chunk × n → finish. A backup is written to storage/app/backups first.
     *
     * @return array<string, mixed>
     */
    public function package(Request $r): array
    {
        $this->ownerOnly();
        $v = $r->validate(['action' => 'required|in:start,chunk,finish,cancel']);
        $upload = $r->session()->get('update_upload');

        if ($v['action'] === 'start') {
            $this->confirmPassword($r);
            $size = (int) $r->validate(['size' => 'required|integer|min:1|max:'.UpdatePackage::MAX_BYTES])['size'];
            $this->discard($upload);
            $id = bin2hex(random_bytes(16));
            if (! is_dir(storage_path('app/updates'))) {
                mkdir(storage_path('app/updates'), 0700, true);
            }
            touch($this->packagePath($id));
            $r->session()->put('update_upload', ['id' => $id, 'size' => $size, 'next' => 0]);

            return ['id' => $id, 'chunk_size' => 1024 * 1024];
        }
        abort_unless($upload && hash_equals($upload['id'], (string) $r->input('id')), 409, __('The upload was interrupted. Start again.'));
        $path = $this->packagePath($upload['id']);

        if ($v['action'] === 'cancel') {
            $this->discard($upload);
            $r->session()->forget('update_upload');

            return ['ok' => true];
        }
        if ($v['action'] === 'chunk') {
            $r->validate(['index' => 'required|integer|min:0', 'chunk' => 'required|file|max:2048']);
            abort_unless((int) $r->input('index') === $upload['next'], 409, __('The upload was interrupted. Start again.'));
            $bytes = (string) file_get_contents($r->file('chunk')->getRealPath());
            if (filesize($path) + strlen($bytes) > $upload['size']) {
                $this->discard($upload);
                $r->session()->forget('update_upload');
                abort(422, __('The upload is larger than announced. Start again.'));
            }
            file_put_contents($path, $bytes, FILE_APPEND | LOCK_EX);
            $upload['next']++;
            $r->session()->put('update_upload', $upload);

            return ['received' => filesize($path)];
        }

        // finish
        clearstatcache();
        abort_unless(filesize($path) === $upload['size'], 409, __('The upload is incomplete. Start again.'));
        @set_time_limit(600);
        try {
            $from = config('erp.version');
            $package = UpdatePackage::inspect($path);
            if (! is_dir(storage_path('app/backups'))) {
                mkdir(storage_path('app/backups'), 0700, true);
            }
            $backup = Backup::create(storage_path('app/backups/before-update-'.now()->format('Y-m-d-His').'.zip'));
            $files = UpdatePackage::install($path);
            $this->audit('system.package_installed', 'files', ['from' => $from, 'to' => $package['version'], 'files' => $files, 'backup' => basename($backup)]);

            return ['from' => $from, 'version' => $package['version'], 'files' => $files, 'backup' => basename($backup)];
        } finally {
            $this->discard($upload);
            $r->session()->forget('update_upload');
        }
    }

    private function packagePath(string $id): string
    {
        return storage_path('app/updates/'.$id.'.zip');
    }

    /**
     * @param  array{id: string}|null  $upload
     */
    private function discard(?array $upload): void
    {
        if ($upload && is_file($this->packagePath($upload['id']))) {
            unlink($this->packagePath($upload['id']));
        }
    }

    /**
     * Add the full demo business (90 days of history) to an installation without sales or purchases.
     *
     * @return array<string, mixed>
     */
    public function demo(Request $r): array
    {
        $this->ownerOnly();
        $this->confirmPassword($r);
        @set_time_limit(300);
        try {
            (new DemoBusinessSeeder)->run();
        } catch (RuntimeException $e) {
            throw ValidationException::withMessages(['demo' => $e->getMessage()]);
        }
        $this->audit('system.demo_added', 'database');

        return ['documents' => DB::table('documents')->count()];
    }

    /**
     * Create a fresh backup and download it once.
     */
    public function backup(Request $r): BinaryFileResponse
    {
        $this->ownerOnly();
        $this->confirmPassword($r);
        @set_time_limit(300);
        $name = 'atelier-erp-backup-'.now()->format('Y-m-d-His').'.zip';
        $path = Backup::create(storage_path('app/'.bin2hex(random_bytes(8)).'.zip'));
        $this->audit('system.backup_download', 'database');

        return response()->download($path, $name, ['Content-Type' => 'application/zip'])->deleteFileAfterSend();
    }

    /**
     * @return list<string>
     */
    private function pendingMigrations(): array
    {
        $migrator = app('migrator');
        if (! $migrator->repositoryExists()) {
            return array_keys($migrator->getMigrationFiles(database_path('migrations')));
        }
        $ran = $migrator->getRepository()->getRan();

        return array_values(array_diff(array_keys($migrator->getMigrationFiles(database_path('migrations'))), $ran));
    }

    private function ownerOnly(): void
    {
        abort_unless(Auth::user()?->active && Auth::user()->role === 'owner', 403, __('Only the owner can manage system updates and backups.'));
    }

    private function confirmPassword(Request $r): void
    {
        $r->validate(['password' => 'required|string']);
        if (! Hash::check($r->input('password'), Auth::user()->password)) {
            throw ValidationException::withMessages(['password' => __('Your password is incorrect.')]);
        }
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function audit(string $action, string $subject, array $details = []): void
    {
        DB::table('audit')->insert(['user_id' => Auth::id(), 'action' => $action, 'subject' => $subject, 'details' => json_encode($details), 'created_at' => now()]);
    }
}
