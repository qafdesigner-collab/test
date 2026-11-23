<?php

use App\Models\User;
use App\Services\Installation;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

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
    if (config('database.default') !== 'sqlite') {
        $this->error('This command supports SQLite only. Use your database-native consistent backup tools for other engines.');

        return 1;
    }
    $db = storage_path('app/backup-'.bin2hex(random_bytes(6)).'.sqlite');
    $pdo = DB::connection()->getPdo();
    $pdo->exec('VACUUM INTO '.$pdo->quote($db));
    $zip = new ZipArchive;
    if ($zip->open($path, ZipArchive::CREATE | ZipArchive::EXCL) !== true) {
        unlink($db);
        $this->error('Cannot create backup.');

        return 1;
    }$zip->addFile($db, 'database.sqlite');
    $dir = storage_path('app/private');
    if (is_dir($dir)) {
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $file) {
            if ($file->isFile()) {
                $zip->addFile($file->getPathname(), 'private/'.substr($file->getPathname(), strlen($dir) + 1));
            }
        }
    }$zip->addFromString('RECOVERY.txt', 'Restore database.sqlite and private files only during maintenance. Keep your APP_KEY/environment separately and securely. This ZIP is unencrypted and contains confidential business data.');
    $zip->close();
    unlink($db);
    chmod($path, 0600);
    $this->info('Consistent database and private assets backup created. Store securely; archive is not encrypted.');
})->purpose('Back up SQLite and private assets without exporting credentials');

Artisan::command('erp:library', function () {
    $this->call('db:seed', ['--class' => 'Database\\Seeders\\InspirationLibrarySeeder', '--force' => true]);
})->purpose('Add missing internal inspiration references from the bundled library');
