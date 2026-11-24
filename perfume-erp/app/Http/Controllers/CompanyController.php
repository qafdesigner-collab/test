<?php

namespace App\Http\Controllers;

use App\Services\Documents;
use App\Services\Stock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Company settings, stock locations, users and the activity log.
 */
class CompanyController extends ErpBaseController
{
    public function settings(Request $r)
    {
        $this->allow(['manager']);
        if ($r->isMethod('post')) {
            $v = $r->validate(['company_name' => 'required|string|max:150', 'address' => 'nullable|string|max:2000', 'phone' => 'nullable|string|max:50', 'email' => 'nullable|email|max:150', 'tax_id' => 'nullable|string|max:50', 'currency' => 'required|string|size:3', 'brand_color' => ['sometimes', 'nullable', 'regex:/^#[0-9a-fA-F]{6}$/'], 'company_name_ar' => 'sometimes|nullable|string|max:150', 'address_ar' => 'sometimes|nullable|string|max:2000', 'vat_registered' => 'sometimes|in:0,1', 'stock_issue_order' => 'sometimes|in:fifo,fefo', 'loyalty_enabled' => 'sometimes|in:0,1', 'loyalty_points_per_aed' => 'sometimes|integer|between:0,100', 'loyalty_point_value_fils' => 'sometimes|integer|between:1,10000', 'invoice_footer' => 'sometimes|nullable|string|max:500']);
            foreach ($v as $k => $val) {
                DB::table('settings')->updateOrInsert(['key' => $k], ['value' => $val ?? '']);
            }$this->audit('settings.update', 'company');

            return ['ok' => true];
        }

        return ['settings' => DB::table('settings')->pluck('value', 'key')];
    }

    public function users(Request $r)
    {
        $this->allow([]);
        if ($r->isMethod('post')) {
            $v = $r->validate(['name' => 'required|string|max:100', 'email' => 'required|email|max:150|unique:users,email', 'password' => 'required|string|min:12|max:128', 'role' => ['required', Rule::in(self::ROLES)]]);
            $id = DB::table('users')->insertGetId(['name' => $v['name'], 'email' => $v['email'], 'password' => Hash::make($v['password']), 'role' => $v['role'], 'active' => true, 'created_at' => now(), 'updated_at' => now()]);
            $this->audit('user.create', 'user:'.$id);

            return ['id' => $id];
        }

        return ['users' => DB::table('users')->select('id', 'name', 'email', 'role', 'active')->selectRaw('two_factor_confirmed_at is not null as two_factor')->get()];
    }

    public function auditLog()
    {
        $this->allow(['manager']);

        return ['audit' => DB::table('audit as a')->leftJoin('users as u', 'a.user_id', '=', 'u.id')->select('a.id', 'a.action', 'a.subject', 'a.created_at', 'u.name as user')->orderByDesc('a.id')->limit(300)->get()];
    }

    public function locations(Request $r)
    {
        $this->allow(['manager']);
        $v = $r->validate(['name' => 'required|string|max:100|unique:locations,name', 'kind' => ['required', Rule::in(['warehouse', 'shop'])]]);
        $id = DB::table('locations')->insertGetId($v + ['created_at' => now(), 'updated_at' => now()]);
        $this->audit('location.create', 'location:'.$id);

        return ['id' => $id];
    }

    public function userAction(Request $r, int $id)
    {
        $this->allow([]);
        $v = $r->validate(['active' => 'required|boolean', 'sales_allowed' => 'sometimes|boolean']);
        if ($id === Auth::id()) {
            Documents::fail(__('You cannot disable your own account.'));
        }abort_unless(DB::table('users')->where('id', $id)->exists(), 404);
        DB::table('users')->where('id', $id)->update(['active' => $v['active'], 'updated_at' => now()]);
        $this->audit('user.status', 'user:'.$id);

        return ['ok' => true];
    }

    /**
     * Upload or remove the company logo shown in the menu, on sign-in and on printed documents.
     */
    public function logo(Request $r)
    {
        $this->allow(['manager']);
        $current = DB::table('settings')->where('key', 'logo_path')->value('value');
        if ($r->boolean('remove')) {
            if ($current) {
                Storage::disk('local')->delete($current);
            }
            DB::table('settings')->where('key', 'logo_path')->delete();
            $this->audit('settings.logo_removed', 'company');

            return ['logo' => null];
        }
        $r->validate(['logo' => 'required|file|mimes:png,jpg,jpeg,webp|mimetypes:image/png,image/jpeg,image/webp|max:2048|dimensions:max_width=4000,max_height=4000']);
        $path = $r->file('logo')->store('branding', 'local');
        if ($current && $current !== $path) {
            Storage::disk('local')->delete($current);
        }
        DB::table('settings')->updateOrInsert(['key' => 'logo_path'], ['value' => $path]);
        $this->audit('settings.logo_uploaded', 'company');

        return ['logo' => '/media/logo?v='.substr(sha1($path), 0, 8)];
    }

    /**
     * The logo is public branding (shown on the sign-in page), never other private files.
     */
    public function logoImage()
    {
        $path = DB::table('settings')->where('key', 'logo_path')->value('value');
        abort_unless($path && str_starts_with($path, 'branding/') && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, null, ['Cache-Control' => 'public, max-age=86400', 'X-Content-Type-Options' => 'nosniff']);
    }
}
