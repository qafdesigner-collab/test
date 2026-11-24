<?php

namespace App\Http\Controllers;

use App\Services\Installation;
use Database\Seeders\DemoBusinessSeeder;
use Database\Seeders\InspirationLibrarySeeder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;
use Throwable;

class InstallController extends Controller
{
    public function show(Request $r): View
    {
        abort_if(Installation::isInstalled(), 404);
        Installation::code();

        return view('install', ['checks' => Installation::requirements(), 'url' => $r->getSchemeAndHttpHost().$r->getBasePath()]);
    }

    public function install(Request $r): RedirectResponse
    {
        abort_if(Installation::isInstalled(), 404);
        $v = $r->validate([
            'install_code' => 'required|string|max:20',
            'app_url' => 'required|url|max:200',
            'db_connection' => ['required', Rule::in(['mysql', 'sqlite'])],
            'db_host' => 'exclude_unless:db_connection,mysql|required|string|max:150',
            'db_port' => 'exclude_unless:db_connection,mysql|required|integer|between:1,65535',
            'db_database' => 'exclude_unless:db_connection,mysql|required|string|max:64',
            'db_username' => 'exclude_unless:db_connection,mysql|required|string|max:80',
            'db_password' => 'exclude_unless:db_connection,mysql|nullable|string|max:200',
            'company_name' => 'required|string|max:150',
            'currency' => 'required|string|size:3',
            'name' => 'required|string|max:100',
            'email' => 'required|email|max:150',
            'password' => 'required|string|min:12|max:128|confirmed',
            'demo' => 'sometimes|boolean',
        ]);
        if (! hash_equals(Installation::code(), strtoupper(trim($v['install_code'])))) {
            throw ValidationException::withMessages(['install_code' => __('The install code does not match storage/app/private/install-code.txt.')]);
        }
        foreach (Installation::requirements() as $check) {
            if (! $check['ok']) {
                throw ValidationException::withMessages(['install_code' => __('Fix the server requirement first: ').$check['label']]);
            }
        }

        $environment = ['APP_URL' => rtrim($v['app_url'], '/'), 'DB_CONNECTION' => $v['db_connection']];
        if ($v['db_connection'] === 'mysql') {
            $environment += ['DB_HOST' => $v['db_host'], 'DB_PORT' => (string) $v['db_port'], 'DB_DATABASE' => $v['db_database'], 'DB_USERNAME' => $v['db_username'], 'DB_PASSWORD' => (string) ($v['db_password'] ?? '')];
            config(['database.connections.mysql' => array_merge(config('database.connections.mysql'), ['host' => $v['db_host'], 'port' => $v['db_port'], 'database' => $v['db_database'], 'username' => $v['db_username'], 'password' => (string) ($v['db_password'] ?? '')])]);
        } else {
            $file = config('erp.sqlite_path');
            if (! is_file($file)) {
                touch($file);
            }
            config(['database.connections.sqlite.database' => $file]);
        }
        config(['database.default' => $v['db_connection']]);
        DB::purge($v['db_connection']);

        try {
            DB::connection()->getPdo();
        } catch (Throwable $e) {
            throw ValidationException::withMessages(['db_host' => __('Could not connect to the database. Check the database name, user and password, and that the user is added to the database in cPanel → MySQL Databases.')]);
        }
        try {
            Installation::writeEnvironment($environment);
        } catch (\InvalidArgumentException $e) {
            throw ValidationException::withMessages(['db_password' => $e->getMessage()]);
        }

        try {
            Artisan::call('migrate', ['--force' => true]);
            if (Installation::isInstalled()) {
                abort(404);
            }
            Installation::createOwner($v['name'], strtolower($v['email']), $v['password'], $v['company_name'], strtoupper($v['currency']));
            (new InspirationLibrarySeeder)->run();
            if ($r->boolean('demo') && ! DB::table('products')->exists()) {
                (new DemoBusinessSeeder)->run();
                foreach (['company_name' => $v['company_name'], 'currency' => strtoupper($v['currency']), 'email' => strtolower($v['email'])] as $key => $value) {
                    DB::table('settings')->updateOrInsert(['key' => $key], ['value' => $value]);
                }
            }
        } catch (Throwable $e) {
            Log::error('Web installation failed', ['exception' => $e]);
            throw ValidationException::withMessages(['install_code' => __('Installation stopped: ').$e->getMessage()]);
        }
        Installation::markInstalled();
        Artisan::call('config:clear');

        return redirect('/login')->with('status', __('Installation complete. Sign in with your owner account.'));
    }
}
