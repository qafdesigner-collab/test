<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use App\Services\Documents;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Business expenses (rent, salaries, utilities…). Expenses are never edited or deleted, only voided with a reason.
 */
class ExpenseController extends ErpBaseController
{
    public const CATEGORIES = ['Rent', 'Salaries & wages', 'Utilities', 'Marketing & advertising', 'Transport & delivery', 'Packaging & printing', 'Bank & card fees', 'Government & licences', 'Repairs & maintenance', 'Office & supplies', 'Software & internet', 'Other'];

    public function index(Request $r)
    {
        $this->allow(['manager', 'accountant']);
        $v = $r->validate(['month' => 'nullable|date_format:Y-m']);
        $month = $v['month'] ?? now()->format('Y-m');
        $from = $month.'-01';
        $to = date('Y-m-t', strtotime($from));
        $rows = DB::table('expenses as e')->leftJoin('contacts as c', 'c.id', '=', 'e.contact_id')->join('users as u', 'u.id', '=', 'e.user_id')
            ->whereBetween('e.spent_on', [$from, $to])->select('e.*', 'c.name as supplier', 'u.name as user')->orderByDesc('e.spent_on')->orderByDesc('e.id')->get();
        $active = $rows->whereNull('voided_at');

        return [
            'month' => $month,
            'expenses' => $rows,
            'total_cents' => (int) $active->sum('amount_cents'),
            'tax_cents' => (int) $active->sum('tax_cents'),
            'by_category' => $active->groupBy('category')->map(fn ($g, $name) => ['category' => $name, 'amount_cents' => (int) $g->sum('amount_cents'), 'count' => $g->count()])->sortByDesc('amount_cents')->values(),
            'categories' => array_values(array_unique(array_merge(self::CATEGORIES, DB::table('expenses')->distinct()->pluck('category')->all()))),
        ];
    }

    public function store(Request $r)
    {
        $this->allow(['manager', 'accountant']);
        $v = $r->validate([
            'spent_on' => 'required|date_format:Y-m-d|before_or_equal:today',
            'category' => 'required|string|max:80',
            'description' => 'required|string|max:300',
            'amount' => 'required',
            'tax' => 'nullable',
            'method' => ['required', Rule::in(['Cash', 'Card', 'Bank'])],
            'from_drawer' => 'sometimes|boolean',
            'contact_id' => 'nullable|exists:contacts,id',
            'reference' => 'nullable|string|max:100',
        ]);
        $amount = Amounts::parse($v['amount']);
        $tax = Amounts::parse($v['tax'] ?? '0');
        if ($amount <= 0 || $tax > $amount) {
            Documents::fail(__('Enter a positive amount; VAT cannot exceed the amount.'));
        }
        $fromDrawer = $r->boolean('from_drawer');
        if ($fromDrawer && $v['method'] !== 'Cash') {
            Documents::fail(__('Only cash expenses can be paid from the cashier drawer.'));
        }

        return $this->once($r, 'expense.create', function () use ($v, $amount, $tax, $fromDrawer) {
            $id = DB::table('expenses')->insertGetId(['spent_on' => $v['spent_on'], 'category' => trim($v['category']), 'description' => $v['description'], 'amount_cents' => $amount, 'tax_cents' => $tax, 'method' => $v['method'], 'from_drawer' => $fromDrawer, 'contact_id' => $v['contact_id'] ?? null, 'reference' => $v['reference'] ?? null, 'user_id' => Auth::id(), 'created_at' => now(), 'updated_at' => now()]);
            $number = 'EXP-'.str_pad((string) $id, 6, '0', STR_PAD_LEFT);
            DB::table('expenses')->where('id', $id)->update(['number' => $number]);
            $this->audit('expense.create', $number, ['amount_cents' => $amount, 'category' => $v['category']]);

            return ['id' => $id, 'number' => $number];
        });
    }

    public function void(Request $r, int $id)
    {
        $this->allow(['manager', 'accountant']);
        $v = $r->validate(['reason' => 'required|string|max:300']);
        $expense = DB::table('expenses')->find($id);
        abort_unless($expense, 404);
        if ($expense->voided_at) {
            Documents::fail(__('This expense is already voided.'));
        }
        DB::table('expenses')->where('id', $id)->update(['voided_at' => now(), 'void_reason' => $v['reason'], 'updated_at' => now()]);
        $this->audit('expense.void', $expense->number, ['reason' => $v['reason']]);

        return ['ok' => true];
    }
}
