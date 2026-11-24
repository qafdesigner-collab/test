<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use App\Services\Documents;
use App\Services\Loyalty;
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

    /**
     * A customer's standard discount and special prices (read), or replace them (managers and accountants).
     * Special prices win over the discount: a product with its own price gets no extra discount.
     */
    public function pricing(Request $r, int $id)
    {
        $this->allow(['manager', 'accountant', 'warehouse', 'cashier']);
        $contact = DB::table('contacts')->find($id);
        abort_unless($contact && $contact->kind === 'customer', 404);
        if ($r->isMethod('post')) {
            $this->allow(['manager', 'accountant']);
            $v = $r->validate(['discount' => 'required', 'prices' => 'present|array|max:500', 'prices.*.product_id' => 'required|distinct|exists:products,id', 'prices.*.price' => 'required']);
            $discount = Amounts::parse($v['discount']);
            if ($discount > 10000) {
                Documents::fail(__('The discount cannot exceed 100%.'));
            }
            DB::transaction(function () use ($id, $v, $discount) {
                DB::table('contacts')->where('id', $id)->update(['discount_bp' => $discount, 'updated_at' => now()]);
                DB::table('customer_prices')->where('contact_id', $id)->delete();
                foreach ($v['prices'] as $row) {
                    DB::table('customer_prices')->insert(['contact_id' => $id, 'product_id' => $row['product_id'], 'price_cents' => Amounts::parse($row['price']), 'created_at' => now(), 'updated_at' => now()]);
                }
            });
            $this->audit('contact.pricing', 'contact:'.$id, ['discount_bp' => $discount, 'special_prices' => count($v['prices'])]);
        }

        return [
            'discount_bp' => (int) DB::table('contacts')->where('id', $id)->value('discount_bp'),
            'prices' => DB::table('customer_prices as c')->join('products as p', 'p.id', '=', 'c.product_id')->where('c.contact_id', $id)
                ->select('c.product_id', 'p.name', 'p.sku', 'c.price_cents', 'p.price_cents as list_price_cents')->orderBy('p.name')->get(),
        ];
    }

    /**
     * Loyalty points balance and recent history for a customer.
     */
    public function loyalty(int $id)
    {
        $this->allow(['manager', 'accountant', 'cashier']);
        $contact = DB::table('contacts')->find($id);
        abort_unless($contact && $contact->kind === 'customer', 404);
        $settings = Loyalty::settings();

        return [
            'enabled' => $settings['enabled'],
            'balance' => Loyalty::balance($id),
            'point_value_cents' => $settings['point_value_cents'],
            'history' => DB::table('loyalty_transactions as t')->leftJoin('documents as d', 'd.id', '=', 't.document_id')->where('t.contact_id', $id)
                ->select('t.created_at', 't.points', 't.reason', 'd.number')->orderByDesc('t.id')->limit(30)->get(),
        ];
    }
}
