<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Customers and suppliers.
 */
class ContactController extends ErpBaseController
{
    public function contacts(Request $r)
    {
        $this->allow(['manager', 'warehouse', 'accountant', 'cashier', 'designer']);
        if ($r->isMethod('post')) {
            $this->allow(['manager', 'warehouse', 'accountant']);
            $v = $r->validate(['name' => 'required|string|max:150', 'kind' => ['required', Rule::in(['customer', 'supplier'])], 'email' => 'nullable|email|max:150', 'phone' => 'nullable|string|max:40', 'address' => 'nullable|string|max:1000', 'tax_id' => 'nullable|string|max:50', 'credit' => 'required', 'terms_days' => 'required|integer|min:0|max:365']);
            $v['credit_cents'] = Amounts::parse($v['credit']);
            unset($v['credit']);

            return ['id' => DB::table('contacts')->insertGetId($v + ['created_at' => now(), 'updated_at' => now()])];
        }

        return ['contacts' => DB::table('contacts')->orderBy('name')->get()];
    }
}
