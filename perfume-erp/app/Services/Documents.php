<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class Documents
{
    public static function create(array $data, int $user): array
    {
        return DB::transaction(function () use ($data, $user) {
            $kind = $data['kind'];
            $lines = [];
            $sub = 0;
            $tax = 0;
            if ($kind === 'Sale' && ! DB::table('shifts')->where('user_id', $user)->whereNull('closed_at')->exists()) {
                self::fail('Open a cashier shift before selling.');
            }
            foreach ($data['lines'] as $line) {
                $p = DB::table('products')->where('id', $line['product_id'])->where('active', true)->first();
                if (! $p) {
                    self::fail('Product is unavailable.');
                }
                if (in_array($kind, ['Sale', 'Invoice', 'Quotation']) && ! $p->sales_allowed) {
                    self::fail('Enable Sell individually on this product before selling or quoting it.');
                }
                $q = Amounts::parse($line['quantity'], 3);
                if ($q <= 0 || $q > 1000000000) {
                    self::fail('Quantity must be positive and within the supported limit.');
                }
                if (in_array($p->unit, ['piece', 'bottle', 'box', 'carton']) && $q % 1000) {
                    self::fail('Counted products require whole quantities.');
                }
                $price = isset($line['price']) ? Amounts::parse($line['price']) : ($kind === 'Purchase' ? $p->cost_cents : $p->price_cents);
                if ($price > 100000000) {
                    self::fail('Unit price is too large.');
                }
                $discount = Amounts::parse($line['discount'] ?? '0');
                $gross = Amounts::roundDivide($q * $price, 1000);
                if ($discount > $gross) {
                    self::fail('Discount exceeds the line value.');
                }
                $net = $gross - $discount;
                $ltax = Amounts::roundDivide($net * $p->tax_bp, 10000);
                $sub += $net;
                $tax += $ltax;
                $lines[] = ['product_id' => $p->id, 'name' => $p->name, 'unit' => $p->unit, 'quantity_milli' => $q, 'price_cents' => $price, 'discount_cents' => $discount, 'tax_bp' => $p->tax_bp, 'subtotal_cents' => $net, 'tax_cents' => $ltax, 'total_cents' => $net + $ltax];
            }
            $total = $sub + $tax;
            $payments = self::payments($data);
            $paid = array_sum(array_column($payments, 'amount_cents'));
            $data['method'] = match (count($payments)) {
                0 => $data['method'] ?? 'Credit',
                1 => $payments[0]['method'],
                default => 'Split',
            };
            [$tendered, $change] = self::tender($data, $payments);
            if ($paid > $total) {
                self::fail('Payment cannot exceed the document total. Record tender/change separately.');
            }
            if ($paid > 0 && $data['method'] === 'Credit') {
                self::fail('Choose Cash, Card, or Bank for a payment.');
            }
            $contact = $data['contact_id'] ?? null;
            if ($contact) {
                $c = DB::table('contacts')->where('id', $contact)->lockForUpdate()->first();
                if (! $c) {
                    self::fail('Contact not found.');
                }if ($kind === 'Purchase' && $c->kind !== 'supplier') {
                    self::fail('Choose a supplier.');
                }if ($kind !== 'Purchase' && $c->kind !== 'customer') {
                    self::fail('Choose a customer.');
                }
            }
            if (in_array($kind, ['Sale', 'Invoice']) && $total > $paid) {
                if (! $contact) {
                    self::fail('A customer is required for credit sales.');
                }$outstanding = DB::table('documents')->where('contact_id', $contact)->whereIn('kind', ['Sale', 'Invoice'])->where('status', 'Posted')->selectRaw('COALESCE(SUM(total_cents+refunded_cents-paid_cents-returned_cents),0) AS balance')->value('balance') ?? 0;
                $outstanding = (int) $outstanding;
                if ($outstanding + $total - $paid > $c->credit_cents) {
                    self::fail('Customer credit limit would be exceeded.');
                }
            }
            if ($kind === 'Quotation' && $paid) {
                self::fail('Quotations cannot receive payment.');
            }
            $id = DB::table('documents')->insertGetId(['uuid' => (string) Str::uuid(), 'kind' => $kind, 'status' => $kind === 'Quotation' ? 'Draft' : 'Posted', 'contact_id' => $contact, 'location_id' => $data['location_id'], 'user_id' => $user, 'subtotal_cents' => $sub, 'tax_cents' => $tax, 'total_cents' => $total, 'paid_cents' => $paid, 'method' => $data['method'] ?? 'Credit', 'notes' => $data['notes'] ?? null, 'seller_snapshot' => json_encode(DB::table('settings')->pluck('value', 'key')->all()), 'contact_snapshot' => $contact ? json_encode((array) $c) : null, 'bill_reference' => $data['bill_reference'] ?? null, 'due_date' => $data['due_date'] ?? null, 'tendered_cents' => $tendered, 'change_cents' => $change, 'created_at' => now(), 'updated_at' => now()]);
            $number = match ($kind) {
                'Sale' => 'POS','Invoice' => 'INV','Quotation' => 'QUO','Purchase' => 'PUR'
            }.'-'.str_pad((string) $id, 6, '0', STR_PAD_LEFT);
            DB::table('documents')->where('id', $id)->update(['number' => $number]);
            foreach ($lines as $line) {
                $p = DB::table('products')->find($line['product_id']);
                if ($p->kind !== 'service') {
                    if ($kind === 'Purchase') {
                        Stock::move($p->id, $data['location_id'], $number, $line['quantity_milli'], 'Purchase receipt', $number, $user, $line['subtotal_cents'], 'Purchase invoice');
                    } elseif (in_array($kind, ['Sale', 'Invoice'])) {
                        $used = Stock::consume($p->id, $data['location_id'], $line['quantity_milli'], 'Sale', $number, $user);
                        $line['cogs_cents'] = array_sum(array_column($used, 'cost_cents'));
                        $line['cost_allocations'] = json_encode($used);
                    }
                }
                if ($p->kind === 'service' && in_array($kind, ['Sale', 'Invoice'])) {
                    $line['cogs_cents'] = Amounts::roundDivide($line['quantity_milli'] * $p->cost_cents, 1000);
                    $line['cost_allocations'] = json_encode([['cost_basis' => 'Service cost estimate']]);
                }
                DB::table('document_lines')->insert($line + ['document_id' => $id]);
            }
            foreach ($payments as $payment) {
                DB::table('payments')->insert($payment + ['document_id' => $id, 'user_id' => $user, 'created_at' => now(), 'updated_at' => now()]);
            }
            DB::table('audit')->insert(['user_id' => $user, 'action' => 'document.create', 'subject' => $number, 'details' => json_encode(['kind' => $kind, 'total_cents' => $total]), 'created_at' => now()]);

            return ['id' => $id, 'number' => $number, 'total_cents' => $total, 'change_cents' => $change];
        }, 3);
    }

    public static function payment(int $id, int $amount, string $method, int $user): array
    {
        return DB::transaction(function () use ($id, $amount, $method, $user) {
            $doc = DB::table('documents')->where('id', $id)->lockForUpdate()->first();
            if (! $doc || ! in_array($doc->kind, ['Sale', 'Invoice', 'Purchase']) || $doc->status !== 'Posted') {
                self::fail('This document cannot receive payments.');
            }if ($amount <= 0 || $doc->paid_cents + $amount > $doc->total_cents) {
                self::fail('Payment must be positive and not exceed the balance.');
            }DB::table('documents')->where('id', $id)->increment('paid_cents', $amount);
            DB::table('payments')->insert(['document_id' => $id, 'amount_cents' => $amount, 'method' => $method, 'user_id' => $user, 'created_at' => now(), 'updated_at' => now()]);

            return ['id' => $id];
        });
    }

    /**
     * Turn a draft or accepted quotation into a posted invoice at the quoted prices.
     * Stock, credit limit and product checks run exactly as for a new invoice.
     */
    public static function convertQuotation(int $id, int $user): array
    {
        return DB::transaction(function () use ($id, $user) {
            $quote = DB::table('documents')->where('id', $id)->lockForUpdate()->first();
            if (! $quote || $quote->kind !== 'Quotation' || ! in_array($quote->status, ['Draft', 'Accepted'])) {
                self::fail('Only a draft or accepted quotation can become an invoice, once.');
            }
            if (! $quote->contact_id) {
                self::fail('Add a customer to the quotation before invoicing it.');
            }
            $terms = (int) DB::table('contacts')->where('id', $quote->contact_id)->value('terms_days');
            $lines = DB::table('document_lines')->where('document_id', $id)->orderBy('id')->get()->map(fn ($l) => [
                'product_id' => $l->product_id,
                'quantity' => Amounts::format((int) $l->quantity_milli, 3),
                'price' => Amounts::format((int) $l->price_cents),
                'discount' => Amounts::format((int) $l->discount_cents),
            ])->all();
            $invoice = self::create([
                'kind' => 'Invoice', 'contact_id' => $quote->contact_id, 'location_id' => $quote->location_id,
                'method' => 'Credit', 'paid' => '0', 'lines' => $lines,
                'notes' => trim('From quotation '.$quote->number.($quote->notes ? "\n".$quote->notes : '')),
                'bill_reference' => $quote->bill_reference, 'due_date' => $terms > 0 ? now()->addDays($terms)->toDateString() : null,
            ], $user);
            DB::table('documents')->where('id', $invoice['id'])->update(['quotation_id' => $id]);
            DB::table('documents')->where('id', $id)->update(['status' => 'Invoiced', 'updated_at' => now()]);
            DB::table('audit')->insert(['user_id' => $user, 'action' => 'quotation.invoiced', 'subject' => $quote->number, 'details' => json_encode(['invoice' => $invoice['number']]), 'created_at' => now()]);

            return $invoice;
        });
    }

    public static function returnSale(int $id, string $condition, int $user): array
    {
        return DB::transaction(function () use ($id, $condition, $user) {
            $d = DB::table('documents')->where('id', $id)->lockForUpdate()->first();
            if (! $d || ! in_array($d->kind, ['Sale', 'Invoice']) || $d->status !== 'Posted') {
                self::fail('Only a posted sale/invoice can be returned, once.');
            }
            if ($d->returned_cents > 0) {
                self::fail('Items from this sale were already returned. Return the remaining items line by line.');
            }
            $cashRefund = (int) DB::table('payments')->where('document_id', $id)->where('method', 'Cash')->sum('amount_cents');
            $rid = DB::table('documents')->insertGetId(['cash_refund_cents' => $cashRefund, 'uuid' => (string) Str::uuid(), 'kind' => 'Return', 'status' => 'Posted', 'original_id' => $id, 'contact_id' => $d->contact_id, 'location_id' => $d->location_id, 'user_id' => $user, 'subtotal_cents' => $d->subtotal_cents, 'tax_cents' => $d->tax_cents, 'total_cents' => $d->total_cents, 'paid_cents' => $d->paid_cents, 'method' => $d->method, 'notes' => 'Full return: '.$condition, 'seller_snapshot' => $d->seller_snapshot, 'contact_snapshot' => $d->contact_snapshot, 'created_at' => now(), 'updated_at' => now()]);
            $num = 'RET-'.str_pad((string) $rid, 6, '0', STR_PAD_LEFT);
            DB::table('documents')->where('id', $rid)->update(['number' => $num]);
            foreach (DB::table('document_lines')->where('document_id', $id)->get() as $line) {
                $l = (array) $line;
                unset($l['id']);
                $l['document_id'] = $rid;
                DB::table('document_lines')->insert($l);
                $p = DB::table('products')->find($line->product_id);
                if ($p->kind !== 'service' && $condition === 'Restock') {
                    Stock::move($p->id, $d->location_id, $num, $line->quantity_milli, 'Customer return', $num, $user, $line->cogs_cents, collect(json_decode($line->cost_allocations ?? '[]', true))->contains(fn ($lot) => str_contains(strtolower($lot['cost_basis'] ?? ''), 'estimate') || ($lot['cost_basis'] ?? '') === 'Mixed cost basis') ? 'Returned cost with estimates' : 'Returned sale cost');
                }
            }
            DB::table('documents')->where('id', $id)->update(['status' => 'Returned', 'updated_at' => now()]);
            DB::table('audit')->insert(['user_id' => $user, 'action' => 'sale.return', 'subject' => $num, 'details' => json_encode(['original' => $d->number, 'refund_recorded_cents' => $d->paid_cents, 'condition' => $condition]), 'created_at' => now()]);

            return ['id' => $rid, 'number' => $num, 'refund_cents' => $d->paid_cents];
        });
    }

    /**
     * Applied payments from either the split `payments` list or the single `paid` + `method` fields.
     *
     * @return list<array{method: string, amount_cents: int}>
     */
    private static function payments(array $data): array
    {
        if (! empty($data['payments'])) {
            $rows = [];
            foreach ($data['payments'] as $payment) {
                $amount = Amounts::parse((string) $payment['amount']);
                if ($amount < 0) {
                    self::fail('Payment amounts cannot be negative.');
                }
                if ($amount > 0) {
                    $rows[] = ['method' => $payment['method'], 'amount_cents' => $amount];
                }
            }

            return $rows;
        }
        $paid = Amounts::parse((string) ($data['paid'] ?? '0'));

        return $paid > 0 ? [['method' => $data['method'] ?? 'Credit', 'amount_cents' => $paid]] : [];
    }

    /**
     * Cash handed over and change due. Only cash can be over-tendered.
     *
     * @param  list<array{method: string, amount_cents: int}>  $payments
     * @return array{0: ?int, 1: ?int}
     */
    private static function tender(array $data, array $payments): array
    {
        if (! isset($data['tendered']) || $data['tendered'] === '' || $data['tendered'] === null) {
            return [null, null];
        }
        $cash = array_sum(array_column(array_filter($payments, fn ($p) => $p['method'] === 'Cash'), 'amount_cents'));
        if ($cash === 0) {
            self::fail('Cash received applies only to cash payments.');
        }
        $tendered = Amounts::parse((string) $data['tendered']);
        if ($tendered < $cash) {
            self::fail('Cash received is less than the cash payment.');
        }

        return [$tendered, $tendered - $cash];
    }

    /**
     * Return some items from a posted sale or invoice.
     *
     * The original document keeps its figures; each line records what came back, and every
     * sales, profit and balance total subtracts it. Money is refunded only where the customer
     * has now paid more than the reduced total; otherwise the return lowers the amount owed.
     *
     * @param  list<array{line_id: int, quantity: string}>  $items
     */
    public static function returnLines(int $id, array $items, string $condition, ?string $refundMethod, int $user): array
    {
        return DB::transaction(function () use ($id, $items, $condition, $refundMethod, $user) {
            $d = DB::table('documents')->where('id', $id)->lockForUpdate()->first();
            if (! $d || ! in_array($d->kind, ['Sale', 'Invoice']) || $d->status !== 'Posted') {
                self::fail('Only a posted sale or invoice can have items returned.');
            }
            $returnLines = [];
            $updates = [];
            $sub = 0;
            $tax = 0;
            foreach ($items as $item) {
                $line = DB::table('document_lines')->where('document_id', $id)->where('id', $item['line_id'])->lockForUpdate()->first();
                if (! $line) {
                    self::fail('That item is not on this document.');
                }
                $q = Amounts::parse((string) $item['quantity'], 3);
                if ($q === 0) {
                    continue;
                }
                if ($q > $line->quantity_milli - $line->returned_milli) {
                    self::fail("Only {$line->name} items that have not been returned yet can be returned.");
                }
                if (in_array($line->unit, ['piece', 'bottle', 'box', 'carton']) && $q % 1000) {
                    self::fail('Counted products are returned in whole quantities.');
                }
                $isLast = $q === $line->quantity_milli - $line->returned_milli;
                $lineSub = $isLast ? $line->subtotal_cents - $line->returned_subtotal_cents : Amounts::roundDivide($line->subtotal_cents * $q, $line->quantity_milli);
                $lineTax = $isLast ? $line->tax_cents - $line->returned_tax_cents : Amounts::roundDivide($line->tax_cents * $q, $line->quantity_milli);
                $lineCogs = $line->cogs_cents === null ? null : ($isLast ? $line->cogs_cents - $line->returned_cogs_cents : Amounts::roundDivide($line->cogs_cents * $q, $line->quantity_milli));
                $sub += $lineSub;
                $tax += $lineTax;
                $updates[] = [$line, $q, $lineSub, $lineTax, $lineCogs];
                $returnLines[] = ['product_id' => $line->product_id, 'name' => $line->name, 'unit' => $line->unit, 'quantity_milli' => $q, 'price_cents' => $line->price_cents, 'discount_cents' => $isLast ? $line->discount_cents - Amounts::roundDivide($line->discount_cents * $line->returned_milli, $line->quantity_milli) : Amounts::roundDivide($line->discount_cents * $q, $line->quantity_milli), 'tax_bp' => $line->tax_bp, 'subtotal_cents' => $lineSub, 'tax_cents' => $lineTax, 'total_cents' => $lineSub + $lineTax, 'cogs_cents' => $lineCogs, 'cost_allocations' => json_encode([['cost_basis' => 'Partial return of '.$d->number]])];
            }
            if (! $returnLines) {
                self::fail('Choose at least one item to return.');
            }
            $total = $sub + $tax;
            $netTotal = $d->total_cents - $d->returned_cents - $total;
            $netPaid = $d->paid_cents - $d->refunded_cents;
            $refund = max(0, $netPaid - $netTotal);
            if ($refund > 0 && ! in_array($refundMethod, ['Cash', 'Card', 'Bank'], true)) {
                self::fail('Choose how the refund is paid back: Cash, Card or Bank.');
            }
            $method = $refund > 0 ? $refundMethod : 'Credit';
            $rid = DB::table('documents')->insertGetId(['uuid' => (string) Str::uuid(), 'kind' => 'Return', 'status' => 'Posted', 'original_id' => $id, 'contact_id' => $d->contact_id, 'location_id' => $d->location_id, 'user_id' => $user, 'subtotal_cents' => $sub, 'tax_cents' => $tax, 'total_cents' => $total, 'paid_cents' => $refund, 'method' => $method, 'cash_refund_cents' => $method === 'Cash' ? $refund : 0, 'notes' => 'Partial return: '.$condition, 'seller_snapshot' => $d->seller_snapshot, 'contact_snapshot' => $d->contact_snapshot, 'created_at' => now(), 'updated_at' => now()]);
            $number = 'RET-'.str_pad((string) $rid, 6, '0', STR_PAD_LEFT);
            DB::table('documents')->where('id', $rid)->update(['number' => $number]);
            foreach ($returnLines as $returnLine) {
                DB::table('document_lines')->insert($returnLine + ['document_id' => $rid]);
            }
            foreach ($updates as [$line, $q, $lineSub, $lineTax, $lineCogs]) {
                DB::table('document_lines')->where('id', $line->id)->update([
                    'returned_milli' => $line->returned_milli + $q,
                    'returned_subtotal_cents' => $line->returned_subtotal_cents + $lineSub,
                    'returned_tax_cents' => $line->returned_tax_cents + $lineTax,
                    'returned_cogs_cents' => $line->returned_cogs_cents + ($lineCogs ?? 0),
                ]);
                $product = DB::table('products')->find($line->product_id);
                if ($product->kind !== 'service' && $condition === 'Restock') {
                    Stock::move($product->id, $d->location_id, $number, $q, 'Customer return', $number, $user, $lineCogs, $lineCogs === null ? 'Configured estimate' : 'Returned sale cost');
                }
            }
            DB::table('documents')->where('id', $id)->update(['returned_cents' => $d->returned_cents + $total, 'refunded_cents' => $d->refunded_cents + $refund, 'updated_at' => now()]);
            DB::table('audit')->insert(['user_id' => $user, 'action' => 'sale.partial_return', 'subject' => $number, 'details' => json_encode(['original' => $d->number, 'returned_cents' => $total, 'refund_cents' => $refund, 'refund_method' => $method, 'condition' => $condition]), 'created_at' => now()]);

            return ['id' => $rid, 'number' => $number, 'returned_cents' => $total, 'refund_cents' => $refund, 'refund_method' => $method];
        });
    }

    public static function fail(string $message): never
    {
        throw ValidationException::withMessages(['document' => $message]);
    }
}
