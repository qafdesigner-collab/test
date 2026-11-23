<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Throwable;

class Installation
{
    /** PHP extensions the ERP needs on the server. */
    public const EXTENSIONS = ['pdo', 'mbstring', 'openssl', 'tokenizer', 'xml', 'ctype', 'json', 'fileinfo', 'gd', 'zip'];

    /**
     * An installation is complete once an owner account exists. The lock file
     * avoids a database query on every request after that.
     */
    public static function isInstalled(): bool
    {
        if (is_file(config('erp.install_lock'))) {
            return true;
        }
        try {
            if (Schema::hasTable('users') && DB::table('users')->exists()) {
                self::markInstalled();

                return true;
            }
        } catch (Throwable) {
            return false;
        }

        return false;
    }

    public static function markInstalled(): void
    {
        self::ensureDirectory(config('erp.install_lock'));
        file_put_contents(config('erp.install_lock'), 'Installed '.now()->toIso8601String()."\n");
        if (is_file(config('erp.install_code'))) {
            @unlink(config('erp.install_code'));
        }
    }

    /**
     * Secret code that proves the person installing has file access to the server.
     */
    public static function code(): string
    {
        $path = config('erp.install_code');
        if (! is_file($path)) {
            self::ensureDirectory($path);
            file_put_contents($path, strtoupper(bin2hex(random_bytes(4)))."\n");
            @chmod($path, 0600);
        }

        return trim((string) file_get_contents($path));
    }

    /**
     * @return list<array{label: string, ok: bool, hint: string}>
     */
    public static function requirements(): array
    {
        $checks = [['label' => __('PHP 8.3 or newer (you have :version)', ['version' => PHP_VERSION]), 'ok' => version_compare(PHP_VERSION, '8.3.0', '>='), 'hint' => __('cPanel → MultiPHP Manager → choose PHP 8.3 for this domain.')]];
        foreach (self::EXTENSIONS as $extension) {
            $checks[] = ['label' => __('PHP extension: :name', ['name' => $extension]), 'ok' => extension_loaded($extension), 'hint' => __('cPanel → Select PHP Version → Extensions → tick :name.', ['name' => $extension])];
        }
        $checks[] = ['label' => __('Database driver: MySQL (pdo_mysql) or SQLite (pdo_sqlite)'), 'ok' => extension_loaded('pdo_mysql') || extension_loaded('pdo_sqlite'), 'hint' => __('Enable pdo_mysql in Select PHP Version → Extensions.')];
        foreach (['storage' => storage_path(), 'bootstrap/cache' => base_path('bootstrap/cache'), '.env file' => base_path('.env')] as $name => $path) {
            $checks[] = ['label' => __('Writable: :name', ['name' => $name]), 'ok' => is_writable($path), 'hint' => __('File Manager → right click → Change Permissions → 755 for folders, 644/600 for files.')];
        }

        return $checks;
    }

    /**
     * Write values into .env. Values are single-quoted so passwords with $, # or spaces stay literal.
     *
     * @param  array<string, string>  $values
     */
    public static function writeEnvironment(array $values, ?string $path = null): void
    {
        $path ??= config('erp.env_file');
        $content = is_file($path) ? (string) file_get_contents($path) : '';
        foreach ($values as $key => $value) {
            if (str_contains($value, "'") || preg_match('/[\r\n]/', $value)) {
                throw new \InvalidArgumentException("The value for {$key} cannot contain a single quote or a line break.");
            }
            $line = $key."='".$value."'";
            $pattern = '/^#?\s*'.preg_quote($key, '/').'=.*$/m';
            $content = preg_match($pattern, $content)
                ? preg_replace_callback($pattern, fn () => $line, $content, 1)
                : rtrim($content)."\n".$line."\n";
        }
        file_put_contents($path, $content, LOCK_EX);
        @chmod($path, 0600);
    }

    /**
     * Create the owner account, company settings and first stock location.
     */
    public static function createOwner(string $name, string $email, string $password, string $company = 'Your Perfume Company', string $currency = 'AED'): void
    {
        DB::transaction(function () use ($name, $email, $password, $company, $currency) {
            DB::table('users')->insert(['name' => $name, 'email' => $email, 'password' => Hash::make($password), 'role' => 'owner', 'active' => true, 'created_at' => now(), 'updated_at' => now()]);
            foreach (['company_name' => $company, 'currency' => $currency, 'address' => '', 'phone' => '', 'email' => $email, 'tax_id' => ''] as $key => $value) {
                DB::table('settings')->updateOrInsert(['key' => $key], ['value' => $value]);
            }
            if (! DB::table('locations')->exists()) {
                DB::table('locations')->insert(['name' => 'Main warehouse', 'kind' => 'warehouse', 'created_at' => now(), 'updated_at' => now()]);
            }
        });
    }

    private static function ensureDirectory(string $file): void
    {
        if (! is_dir(dirname($file))) {
            mkdir(dirname($file), 0755, true);
        }
    }
}
