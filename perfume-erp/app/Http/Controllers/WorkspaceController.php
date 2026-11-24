<?php

namespace App\Http\Controllers;

use App\Services\DashboardMetrics;
use App\Services\Stock;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Data that opens the workspace: session bootstrap, dashboard and staff list.
 */
class WorkspaceController extends ErpBaseController
{
    public function bootstrap()
    {
        abort_unless(Auth::user()->active, 403);
        $user = Auth::user();

        return ['user' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'role' => $user->role], 'settings' => DB::table('settings')->pluck('value', 'key'), 'locations' => DB::table('locations')->get(), 'csrf' => csrf_token(), 'build' => config('erp.asset_version'), 'version' => $user->role === 'owner' ? config('erp.version') : null, 'capabilities' => ['hybrid_sync' => false, 'uae_einvoice' => false, 'full_accounting' => false, 'arabic' => true, 'terminal_integration' => false]];
    }

    public function dashboard()
    {
        $this->allow(['manager', 'accountant', 'warehouse', 'production', 'cashier', 'designer']);
        $finance = in_array(Auth::user()->role, ['owner', 'manager', 'accountant']);
        $sales = DB::table('documents')->whereIn('kind', ['Sale', 'Invoice'])->where('status', 'Posted');
        $stock = DB::table('products as p')->leftJoin('balances as b', 'p.id', '=', 'b.product_id')->where('p.active', true)->where('p.kind', '!=', 'service')->groupBy('p.id', 'p.name', 'p.sku', 'p.unit', 'p.reorder_milli')->select('p.id', 'p.name', 'p.sku', 'p.unit', 'p.reorder_milli')->selectRaw('COALESCE(SUM(b.quantity_milli),0) as stock')->get();
        $trend = DB::table('documents')->whereIn('kind', ['Sale', 'Invoice'])->where('status', 'Posted')->where('created_at', '>=', now()->subDays(6)->startOfDay())->selectRaw('DATE(created_at) as day,SUM(total_cents-returned_cents) as total')->groupByRaw('DATE(created_at)')->get();

        return ['products' => DB::table('products')->where('active', true)->count(), 'revenue_cents' => $finance ? (int) (clone $sales)->selectRaw('COALESCE(SUM(total_cents-returned_cents),0) as n')->value('n') : null, 'outstanding_cents' => $finance ? (int) (clone $sales)->selectRaw('COALESCE(SUM(total_cents+refunded_cents-paid_cents-returned_cents),0) as n')->value('n') : null, 'production' => DB::table('batches')->where('status', '!=', 'Completed')->count(), 'projects' => DB::table('projects')->where('status', '!=', 'Delivered')->count(), 'low_stock' => $stock->each(fn ($p) => $p->stock = (int) $p->stock)->filter(fn ($p) => $p->stock <= $p->reorder_milli)->values(), 'recent' => DB::table('documents as d')->leftJoin('contacts as c', 'c.id', '=', 'd.contact_id')->when(! $finance, fn ($q) => $q->where('d.user_id', Auth::id()))->select('d.*', 'c.name as contact_name')->orderByDesc('d.id')->limit(6)->get(), 'trend' => $finance ? $trend->each(fn ($d) => $d->total = (int) $d->total) : [], 'sales' => $finance ? DashboardMetrics::sales() : null, 'expiring' => Stock::expiring(60), 'batches' => DB::table('batches as b')->join('formulas as f', 'f.id', '=', 'b.formula_id')->select('b.number', 'b.planned', 'b.status', 'f.name as formula_name')->orderByDesc('b.id')->limit(5)->get()];
    }

    public function staff()
    {
        $this->allow(['manager', 'designer']);

        return ['staff' => DB::table('users')->where('active', true)->select('id', 'name', 'role')->get()];
    }
}
