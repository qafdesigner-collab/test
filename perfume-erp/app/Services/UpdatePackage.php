<?php

namespace App\Services;

use Illuminate\Validation\ValidationException;
use RuntimeException;
use ZipArchive;

/**
 * Installs a cPanel update package (atelier-erp-cpanel-<version>.zip) from inside the application, so the
 * owner does not need the File Manager. The package is checked completely before any file is written:
 * every entry must sit under perfume-erp/ or public_html/, path tricks are refused, and the version must
 * not be older than the running one. Your .env, the storage folder and a SQLite database are never touched.
 */
final class UpdatePackage
{
    public const MAX_BYTES = 200 * 1024 * 1024;

    private const REQUIRED = ['perfume-erp/artisan', 'perfume-erp/config/erp.php', 'perfume-erp/vendor/autoload.php', 'perfume-erp/public/index.php'];

    /**
     * @return array{version: string, files: int}
     */
    public static function inspect(string $zipPath): array
    {
        $zip = self::open($zipPath);
        try {
            $names = [];
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = (string) $zip->getNameIndex($i);
                if (! self::safeName($name)) {
                    self::fail(__('The update package contains an unexpected file: :name', ['name' => mb_substr($name, 0, 80)]));
                }
                $names[$name] = true;
            }
            foreach (self::REQUIRED as $required) {
                if (! isset($names[$required])) {
                    self::fail(__('This is not an Atelier ERP update package. Upload the atelier-erp-cpanel ZIP file.'));
                }
            }
            $config = (string) $zip->getFromName('perfume-erp/config/erp.php');
            if (! preg_match("/\\\$version = '([0-9]+\\.[0-9]+\\.[0-9]+)'|'version' => '([0-9]+\\.[0-9]+\\.[0-9]+)'/", $config, $m)) {
                self::fail(__('The version of the update package cannot be read.'));
            }
            $version = $m[1] ?: $m[2];
            if (version_compare($version, config('erp.version'), '<')) {
                self::fail(__('This package is older (:package) than the installed version. Older versions cannot be installed.', ['package' => $version]));
            }

            return ['version' => $version, 'files' => count(array_filter(array_keys($names), fn ($n) => ! str_ends_with($n, '/')))];
        } finally {
            $zip->close();
        }
    }

    /**
     * Copy the package files over the installation. Returns the number of files written.
     */
    public static function install(string $zipPath): int
    {
        self::inspect($zipPath);
        $zip = self::open($zipPath);
        $root = config('erp.update_root');
        $base = rtrim($root ?: base_path(), '/');
        $public = rtrim($root ? $root.'/public' : public_path(), '/');
        $separatePublic = realpath($public) !== realpath($base.'/public');
        $written = 0;
        try {
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = (string) $zip->getNameIndex($i);
                $target = self::target($name, $base, $public, $separatePublic);
                if ($target === null) {
                    continue;
                }
                if (str_ends_with($name, '/')) {
                    if (! is_dir($target)) {
                        mkdir($target, 0755, true);
                    }

                    continue;
                }
                if (! is_dir(dirname($target))) {
                    mkdir(dirname($target), 0755, true);
                }
                $temporary = $target.'.update-'.bin2hex(random_bytes(4));
                $in = $zip->getStream($name);
                $out = fopen($temporary, 'wb');
                if (! $in || ! $out) {
                    throw new RuntimeException("Cannot write {$name}.");
                }
                stream_copy_to_stream($in, $out);
                fclose($in);
                fclose($out);
                @chmod($temporary, str_ends_with($name, '/artisan') ? 0755 : 0644);
                if (! rename($temporary, $target)) {
                    @unlink($temporary);
                    throw new RuntimeException("Cannot replace {$name}.");
                }
                $written++;
            }
        } finally {
            $zip->close();
        }
        self::clearCaches($base);

        return $written;
    }

    private static function target(string $name, string $base, string $public, bool $separatePublic): ?string
    {
        if (str_starts_with($name, 'perfume-erp/')) {
            $relative = substr($name, strlen('perfume-erp/'));
            $skip = $relative === '' || $relative === '.env' || str_starts_with($relative, 'storage/')
                || preg_match('#^database/.*\.sqlite$#', $relative) || str_starts_with($relative, 'bootstrap/cache/');

            return $skip ? null : $base.'/'.$relative;
        }
        if (str_starts_with($name, 'public_html/') && $separatePublic) {
            $relative = substr($name, strlen('public_html/'));
            // Keep your own public_html/index.php: it holds the path to the perfume-erp folder.
            if ($relative === '' || ($relative === 'index.php' && is_file($public.'/index.php'))) {
                return null;
            }

            return $public.'/'.$relative;
        }

        return null;
    }

    private static function clearCaches(string $base): void
    {
        foreach (glob($base.'/bootstrap/cache/*.php') ?: [] as $file) {
            @unlink($file);
        }
        foreach (glob(storage_path('framework/views/*.php')) ?: [] as $file) {
            @unlink($file);
        }
        if (function_exists('opcache_reset')) {
            @opcache_reset();
        }
    }

    private static function safeName(string $name): bool
    {
        if ($name === '' || str_contains($name, '\\') || str_contains($name, "\0") || str_starts_with($name, '/') || preg_match('#(^|/)\.\.(/|$)#', $name)) {
            return false;
        }

        return $name === 'README-CPANEL.md' || str_starts_with($name, 'perfume-erp/') || str_starts_with($name, 'public_html/');
    }

    private static function open(string $zipPath): ZipArchive
    {
        $zip = new ZipArchive;
        if ($zip->open($zipPath) !== true) {
            self::fail(__('The uploaded file is not a valid ZIP file.'));
        }

        return $zip;
    }

    private static function fail(string $message): never
    {
        throw ValidationException::withMessages(['package' => $message]);
    }
}
