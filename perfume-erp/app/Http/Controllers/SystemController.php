<?php

namespace App\Http\Controllers;

use App\Services\Backup;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
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
