<?php

use App\Models\User;
use App\Services\Backup;
use App\Services\Installation;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('erp:install {--demo : Add fictional sample catalogue}', function () {
    if (User::exists()) {
        $this->error('Installation already has users. Nothing changed.');

        return 1;
    }
    $name = $this->ask('Owner name');
    $email = $this->ask('Owner email');
    $password = $this->secret('Owner password (minimum 12 characters)');
    if (! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password ?? '') < 12 || ! trim($name ?? '')) {
        $this->error('Valid name, email and 12-character password are required.');

        return 1;
    }
    Installation::createOwner($name, $email, $password);
    $this->call('db:seed', ['--class' => 'Database\\Seeders\\InspirationLibrarySeeder', '--force' => true]);
    if ($this->option('demo')) {
        $this->call('db:seed', ['--class' => 'Database\\Seeders\\PerfumeSeeder', '--force' => true]);
    }
    Installation::markInstalled();
    $this->info('Owner created. Sign in at /login. No default shared password is used.');
})->purpose('Initialize the private company installation');
Artisan::command('erp:backup {destination : Absolute destination ZIP path outside public/}', function () {
    $path = $this->argument('destination');
    if (! str_starts_with($path, DIRECTORY_SEPARATOR) || str_starts_with($path, public_path()) || file_exists($path)) {
        $this->error('Choose a new absolute path outside public/.');

        return 1;
    }
    try {
        Backup::create($path);
    } catch (RuntimeException $e) {
        $this->error($e->getMessage());

        return 1;
    }
    $this->info('Consistent database and private assets backup created. Store securely; archive is not encrypted.');
})->purpose('Back up the database (SQLite or MySQL) and private assets without exporting credentials');

Artisan::command('erp:backup-auto {--keep=14 : Number of daily backups to keep}', function () {
    $path = Backup::rotate(max(1, (int) $this->option('keep')));
    $this->info('Backup created: '.$path);
})->purpose('Daily backup into storage/app/backups (use from a cPanel cron job)');

Schedule::command('erp:backup-auto')->dailyAt('02:17');

Artisan::command('erp:library', function () {
    $this->call('db:seed', ['--class' => 'Database\\Seeders\\InspirationLibrarySeeder', '--force' => true]);
})->purpose('Add missing internal inspiration references from the bundled library');
