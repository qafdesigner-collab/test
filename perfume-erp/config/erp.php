<?php

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

    'version' => '0.6.0',

];
