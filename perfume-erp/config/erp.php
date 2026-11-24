<?php

$version = '0.10.0';

return [

    /*
     * Redirect every page to the web installer until an owner account exists.
     * Disabled in the automated test environment (see phpunit.xml).
     */
    'install_check' => env('ERP_INSTALL_CHECK', true),

    'install_lock' => storage_path('app/private/installed.lock'),

    'install_code' => storage_path('app/private/install-code.txt'),

    'env_file' => base_path('.env'),

    'sqlite_path' => database_path('database.sqlite'),

    'version' => $version,

    /* Where update packages are installed; empty means this installation. Only the tests change it. */
    'update_root' => null,

    /*
     * Cache-busting code for CSS and JS links. Derived from the version and the application key so the
     * release number is not readable from the page source; only the owner sees it in the System panel.
     */
    'asset_version' => substr(hash('sha256', $version.'|'.env('APP_KEY', '')), 0, 10),

];
