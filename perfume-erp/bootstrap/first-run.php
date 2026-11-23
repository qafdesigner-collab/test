<?php

/*
 * First request on a fresh upload (for example cPanel without SSH).
 *
 * Creates .env from .env.example with a unique APP_KEY and file-based
 * sessions/cache so the web installer can open before any database exists.
 * Existing .env files are only given a key when theirs is empty.
 */

$base = dirname(__DIR__);
$env = $base.'/.env';

if (! is_file($env) && is_file($base.'/.env.example')) {
    $settings = [
        'APP_ENV' => 'production',
        'APP_DEBUG' => 'false',
        'APP_KEY' => 'base64:'.base64_encode(random_bytes(32)),
        'SESSION_DRIVER' => 'file',
        'CACHE_STORE' => 'file',
        'QUEUE_CONNECTION' => 'sync',
        'LOG_LEVEL' => 'warning',
    ];
    $content = file_get_contents($base.'/.env.example');
    foreach ($settings as $key => $value) {
        $line = $key.'='.$value;
        $content = preg_match("/^{$key}=.*$/m", $content)
            ? preg_replace("/^{$key}=.*$/m", $line, $content)
            : rtrim($content)."\n".$line."\n";
    }
    if (@file_put_contents($env, $content, LOCK_EX) !== false) {
        @chmod($env, 0600);
    }
} elseif (is_file($env) && preg_match('/^APP_KEY=\s*$/m', (string) file_get_contents($env))) {
    $content = preg_replace('/^APP_KEY=\s*$/m', 'APP_KEY=base64:'.base64_encode(random_bytes(32)), file_get_contents($env));
    @file_put_contents($env, $content, LOCK_EX);
}
