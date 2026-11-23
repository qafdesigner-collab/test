<?php

namespace App\Services;

use FilesystemIterator;
use Illuminate\Support\Facades\DB;
use PDO;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RuntimeException;
use ZipArchive;

class Backup
{
    /** Tables whose rows are temporary and not worth restoring. */
    private const STRUCTURE_ONLY = ['sessions', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs'];

    /**
     * Write a consistent database snapshot plus private uploads into a new ZIP file.
     */
    public static function create(string $zipPath): string
    {
        if (file_exists($zipPath)) {
            throw new RuntimeException('The backup destination already exists.');
        }
        $driver = DB::connection()->getDriverName();
        $temporary = storage_path('app/backup-'.bin2hex(random_bytes(6)).($driver === 'sqlite' ? '.sqlite' : '.sql'));

        try {
            match ($driver) {
                'sqlite' => self::sqliteSnapshot($temporary),
                'mysql', 'mariadb' => self::mysqlDump($temporary),
                default => throw new RuntimeException("Backups are not supported for the {$driver} database driver."),
            };

            $zip = new ZipArchive;
            if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::EXCL) !== true) {
                throw new RuntimeException('Cannot create the backup file.');
            }
            $zip->addFile($temporary, $driver === 'sqlite' ? 'database.sqlite' : 'database.sql');
            $private = storage_path('app/private');
            if (is_dir($private)) {
                foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($private, FilesystemIterator::SKIP_DOTS)) as $file) {
                    $relative = substr($file->getPathname(), strlen($private) + 1);
                    if ($file->isFile() && ! in_array($relative, ['installed.lock', 'install-code.txt'], true)) {
                        $zip->addFile($file->getPathname(), 'private/'.$relative);
                    }
                }
            }
            $zip->addFromString('RECOVERY.txt', self::recoveryNotes($driver));
            $zip->close();
            @chmod($zipPath, 0600);
        } finally {
            if (is_file($temporary)) {
                unlink($temporary);
            }
        }

        return $zipPath;
    }

    /**
     * Daily backup into storage/app/backups, keeping the newest $keep files.
     */
    public static function rotate(int $keep = 14): string
    {
        $directory = storage_path('app/backups');
        if (! is_dir($directory)) {
            mkdir($directory, 0700, true);
        }
        $path = self::create($directory.'/erp-'.now()->format('Y-m-d-His').'.zip');
        $files = glob($directory.'/erp-*.zip') ?: [];
        rsort($files);
        foreach (array_slice($files, $keep) as $old) {
            unlink($old);
        }

        return $path;
    }

    /**
     * @return list<array{name: string, bytes: int, created_at: string}>
     */
    public static function automaticBackups(): array
    {
        $files = glob(storage_path('app/backups/erp-*.zip')) ?: [];
        rsort($files);

        return array_map(fn ($file) => ['name' => basename($file), 'bytes' => filesize($file), 'created_at' => date(DATE_ATOM, filemtime($file))], $files);
    }

    private static function sqliteSnapshot(string $target): void
    {
        $pdo = DB::connection()->getPdo();
        $pdo->exec('VACUUM INTO '.$pdo->quote($target));
    }

    /**
     * Plain SQL dump that phpMyAdmin (cPanel) can import.
     */
    private static function mysqlDump(string $target): void
    {
        $pdo = DB::connection()->getPdo();
        $out = fopen($target, 'wb');
        fwrite($out, "-- Atelier Perfume ERP backup\n-- Created ".now()->toIso8601String()."\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n");
        $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');
        try {
            $tables = $pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_NUM);
            foreach (array_column($tables, 0) as $table) {
                $quoted = '`'.str_replace('`', '``', $table).'`';
                $create = $pdo->query("SHOW CREATE TABLE {$quoted}")->fetch(PDO::FETCH_NUM)[1];
                fwrite($out, "DROP TABLE IF EXISTS {$quoted};\n{$create};\n\n");
                if (in_array($table, self::STRUCTURE_ONLY, true)) {
                    continue;
                }
                $rows = $pdo->query("SELECT * FROM {$quoted}", PDO::FETCH_ASSOC);
                $batch = [];
                $columns = null;
                foreach ($rows as $row) {
                    $columns ??= implode(', ', array_map(fn ($c) => '`'.str_replace('`', '``', $c).'`', array_keys($row)));
                    $batch[] = '('.implode(', ', array_map(fn ($v) => $v === null ? 'NULL' : $pdo->quote((string) $v), $row)).')';
                    if (count($batch) === 200) {
                        fwrite($out, "INSERT INTO {$quoted} ({$columns}) VALUES\n".implode(",\n", $batch).";\n");
                        $batch = [];
                    }
                }
                if ($batch) {
                    fwrite($out, "INSERT INTO {$quoted} ({$columns}) VALUES\n".implode(",\n", $batch).";\n");
                }
                fwrite($out, "\n");
            }
        } finally {
            $pdo->exec('COMMIT');
        }
        fwrite($out, "SET FOREIGN_KEY_CHECKS=1;\n");
        fclose($out);
    }

    private static function recoveryNotes(string $driver): string
    {
        $database = $driver === 'sqlite'
            ? 'database.sqlite replaces perfume-erp/database/database.sqlite.'
            : 'database.sql is imported in cPanel → phpMyAdmin → select the (empty) ERP database → Import.';

        return "Atelier Perfume ERP backup\n\n1. Restore only during maintenance, when nobody is using the system.\n2. {$database}\n3. The private/ folder replaces perfume-erp/storage/app/private (product images, artwork).\n4. Keep your .env file (APP_KEY) separately: it is not in this backup and is needed to read customer artwork links.\n\nThis ZIP is not encrypted and contains confidential business data. Store it securely.\n";
    }
}
