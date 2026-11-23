<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use App\Services\Documents;
use App\Services\Profitability;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Quotations, invoices, POS sales, purchases, payments and returns.
 */
class DocumentController extends ErpBaseController
{
    public function documents(Request $r)
    {
        $this->allow(['manager', 'accountant', 'cashier', 'warehouse']);
        $q = DB::table('documents as d')->leftJoin('contacts as c', 'c.id', '=', 'd.contact_id')->select('d.*', 'c.name as contact');
        if (Auth::user()->role === 'cashier') {
            $q->where('d.user_id', Auth::id());
        }if ($r->filled('kind')) {
            $q->whereIn('d.kind', explode(',', (string) $r->string('kind')));
        }

        return ['documents' => $q->orderByDesc('d.id')->limit(300)->get()];
    }

    public function document(int $id)
    {
        $this->allow(['manager', 'accountant', 'cashier', 'warehouse']);
        $d = DB::table('documents')->find($id);
        abort_unless($d, 404);
        if (Auth::user()->role === 'cashier') {
            abort_unless($d->user_id === Auth::id(), 403);
        }

        $lines = DB::table('document_lines')->where('document_id', $id)->get();
        $finance = in_array(Auth::user()->role, ['owner', 'manager', 'accountant']);
        foreach ($lines as $line) {
            if (! $finance) {
                unset($line->cogs_cents,$line->cost_allocations);
            } else {
                $line->cost_allocations = $line->cost_allocations ? json_decode($line->cost_allocations, true) : null;
            }
        }

        return ['document' => $d, 'lines' => $lines, 'profit' => $finance ? Profitability::document($d, $lines) : null, 'payments' => DB::table('payments')->where('document_id', $id)->get(), 'quotation' => $d->quotation_id ? DB::table('documents')->select('id', 'number')->find($d->quotation_id) : null, 'purchase_order' => $d->purchase_order_id ? DB::table('documents')->select('id', 'number')->find($d->purchase_order_id) : null, 'receipts' => $d->kind === 'PurchaseOrder' ? DB::table('documents')->select('id', 'number', 'created_at', 'total_cents')->where('purchase_order_id', $d->id)->orderBy('id')->get() : [], 'invoice' => $d->kind === 'Quotation' ? DB::table('documents')->select('id', 'number')->where('quotation_id', $d->id)->first() : null, 'contact' => $d->contact_snapshot ? json_decode($d->contact_snapshot, true) : ($d->contact_id ? DB::table('contacts')->find($d->contact_id) : null)];
    }

    public function createDocument(Request $r)
    {
        $this->allow(['manager', 'accountant', 'cashier', 'warehouse']);
        $v = $r->validate(['kind' => ['required', Rule::in(['Sale', 'Invoice', 'Quotation', 'Purchase', 'PurchaseOrder'])], 'contact_id' => 'nullable|exists:contacts,id', 'location_id' => 'required|exists:locations,id', 'method' => ['required_without:payments', Rule::in(['Cash', 'Card', 'Bank', 'Credit'])], 'paid' => 'required_without:payments', 'payments' => 'sometimes|array|min:1|max:4', 'payments.*.method' => ['required', Rule::in(['Cash', 'Card', 'Bank'])], 'payments.*.amount' => 'required', 'tendered' => 'nullable', 'notes' => 'nullable|string|max:3000', 'bill_reference' => 'nullable|string|max:100', 'due_date' => 'nullable|date_format:Y-m-d', 'lines' => 'required|array|min:1|max:100', 'lines.*.product_id' => 'required|exists:products,id', 'lines.*.quantity' => 'required', 'lines.*.price' => 'nullable', 'lines.*.discount' => 'nullable']);
        if (in_array($v['kind'], ['Purchase', 'PurchaseOrder'])) {
            $this->allow(['manager', 'warehouse', 'accountant']);
        }if ($v['kind'] !== 'Sale') {
            $this->allow(['manager', 'accountant', 'warehouse']);
        }if (Auth::user()->role === 'cashier') {
            foreach ($v['lines'] as $l) {
                $p = DB::table('products')->find($l['product_id']);
                if (isset($l['price']) && Amounts::parse($l['price']) !== $p->price_cents) {
                    abort(403, 'Cashiers cannot override prices.');
                }if (Amounts::parse($l['discount'] ?? '0') > 0) {
                    abort(403, 'Discount approval is required.');
                }
            }
        }

        return $this->once($r, 'document.create', fn () => Documents::create($v, Auth::id()));
    }

    public function documentAction(Request $r, int $id)
    {
        $action = $r->input('action');
        $this->allow($action === 'receive' ? ['manager', 'warehouse'] : ['manager', 'accountant']);
        if ($action === 'payment') {
            $r->validate(['amount' => 'required', 'method' => ['required', Rule::in(['Cash', 'Card', 'Bank'])]]);

            return $this->once($r, 'payment', fn () => Documents::payment($id, Amounts::parse($r->input('amount')), $r->input('method'), Auth::id()));
        }if ($action === 'return' && $r->has('lines')) {
            $v = $r->validate(['condition' => ['required', Rule::in(['Restock', 'Do not restock'])], 'refund_method' => ['nullable', Rule::in(['Cash', 'Card', 'Bank'])], 'lines' => 'required|array|min:1|max:100', 'lines.*.line_id' => 'required|integer', 'lines.*.quantity' => 'required']);

            return $this->once($r, 'partial_return', fn () => Documents::returnLines($id, $v['lines'], $v['condition'], $v['refund_method'] ?? null, Auth::id()));
        }if ($action === 'return') {
            $r->validate(['condition' => ['required', Rule::in(['Restock', 'Do not restock'])]]);

            return $this->once($r, 'return', fn () => Documents::returnSale($id, $r->input('condition'), Auth::id()));
        }if ($action === 'receive') {
            $this->allow(['manager', 'warehouse']);
            $v = $r->validate(['location_id' => 'required|exists:locations,id', 'bill_reference' => 'nullable|string|max:100', 'lines' => 'required|array|min:1|max:100', 'lines.*.line_id' => 'required|integer', 'lines.*.quantity' => 'required']);

            return $this->once($r, 'purchase_order.receive', fn () => Documents::receiveOrder($id, $v['lines'], (int) $v['location_id'], $v['bill_reference'] ?? null, Auth::id()));
        }if ($action === 'close') {
            return $this->once($r, 'purchase_order.close', fn () => Documents::closeOrder($id, Auth::id()));
        }if ($action === 'convert') {
            return $this->once($r, 'quotation.convert', fn () => Documents::convertQuotation($id, Auth::id()));
        }if (in_array($action, ['accept', 'decline'])) {
            return DB::transaction(function () use ($id, $action) {
                $doc = DB::table('documents')->where('id', $id)->lockForUpdate()->first();
                if (! $doc || $doc->kind !== 'Quotation' || $doc->status !== 'Draft') {
                    Documents::fail('Only a draft quotation can be approved or declined.');
                }DB::table('documents')->where('id', $id)->update(['status' => $action === 'accept' ? 'Accepted' : 'Declined', 'updated_at' => now()]);
                $this->audit('quotation.'.$action, $doc->number);

                return ['ok' => true];
            });
        }Documents::fail('Unknown document action.');
    }
}
