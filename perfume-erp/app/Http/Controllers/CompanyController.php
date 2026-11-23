<?php

namespace App\Http\Controllers;

use App\Services\Documents;
use App\Services\Stock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
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
            $v = $r->validate(['company_name' => 'required|string|max:150', 'address' => 'nullable|string|max:2000', 'phone' => 'nullable|string|max:50', 'email' => 'nullable|email|max:150', 'tax_id' => 'nullable|string|max:50', 'currency' => 'required|string|size:3']);
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

        return ['users' => DB::table('users')->select('id', 'name', 'email', 'role', 'active')->get()];
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
            Documents::fail('You cannot disable your own account.');
        }abort_unless(DB::table('users')->where('id', $id)->exists(), 404);
        DB::table('users')->where('id', $id)->update(['active' => $v['active'], 'updated_at' => now()]);
        $this->audit('user.status', 'user:'.$id);

        return ['ok' => true];
    }
}
