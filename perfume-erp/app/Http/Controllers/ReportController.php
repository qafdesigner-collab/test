<?php

namespace App\Http\Controllers;

use App\Services\Dossiers;
use App\Services\Profitability;
use App\Services\ProfitLoss;
use App\Services\Stock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Customer/product 360 records, profitability and CSV exports.
 */
class ReportController extends ErpBaseController
{
    public function customerDossier(int $id): array
    {
        $this->allow(['manager']);

        return Dossiers::customer($id);
    }

    public function productDossier(int $id): array
    {
        $this->allow(['manager']);

        return Dossiers::product($id);
    }

    public function profitability(): array
    {
        $this->allow(['manager', 'accountant']);

        return Profitability::report();
    }

    public function export(Request $r)
    {
        $this->allow(['manager', 'accountant']);
        $kind = $r->input('type', 'sales');
        $rows = $kind === 'profit' ? collect(Profitability::report()['products'])->map(fn ($r) => (object) $r) : ($kind === 'stock' ? Stock::balances() : DB::table('documents')->orderBy('id')->get());

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            if (count($rows)) {
                fputcsv($out, array_keys((array) $rows[0]));
                foreach ($rows as $row) {
                    fputcsv($out, array_map(function ($v) {
                        $s = (string) $v;

                        return preg_match('/^[=+@\t\r-]/', $s) ? "'".$s : $s;
                    }, (array) $row));
                }
            }fclose($out);
        }, 'perfume-'.$kind.'-'.date('Y-m-d').'.csv', ['Content-Type' => 'text/csv']);
    }

    /**
     * Monthly profit and loss for a year, or its CSV.
     */
    public function profitLoss(Request $r)
    {
        $this->allow(['manager', 'accountant']);
        $r->validate(['year' => 'nullable|integer|between:2000,2100']);
        $year = $r->integer('year') ?: (int) now()->format('Y');
        if ($r->boolean('csv')) {
            return response(ProfitLoss::csv($year), 200, ['Content-Type' => 'text/csv; charset=UTF-8', 'Content-Disposition' => 'attachment; filename="profit-and-loss-'.$year.'.csv"']);
        }

        return ProfitLoss::year($year);
    }
}
