<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class DashboardMetrics
{
    /**
     * Sales figures for the owner, managers and accountants.
     *
     * @return array{period: array<string, int>, trend: list<array{day: string, total: int, count: int}>, top_products: list<array{id: int, name: string, unit: string, quantity_milli: int, revenue_cents: int}>}
     */
    public static function sales(int $days = 30, int $trendDays = 14): array
    {
        $now = now();
        $start = $now->copy()->subDays($days - 1)->startOfDay();
        $previousStart = $start->copy()->subDays($days);

        $current = self::totals($start, $now);
        $previous = self::totals($previousStart, $start);

        $trendStart = $now->copy()->subDays($trendDays - 1)->startOfDay();
        $daily = self::posted()->where('created_at', '>=', $trendStart)
            ->selectRaw('DATE(created_at) as day, SUM(total_cents) as total, COUNT(*) as count')
            ->groupByRaw('DATE(created_at)')->get()->keyBy(fn ($row) => (string) $row->day);
        $trend = [];
        for ($date = $trendStart->copy(); $date <= $now; $date->addDay()) {
            $row = $daily->get($date->toDateString());
            $trend[] = ['day' => $date->toDateString(), 'total' => (int) ($row->total ?? 0), 'count' => (int) ($row->count ?? 0)];
        }

        $top = DB::table('document_lines as l')->join('documents as d', 'd.id', '=', 'l.document_id')->join('products as p', 'p.id', '=', 'l.product_id')
            ->whereIn('d.kind', ['Sale', 'Invoice'])->where('d.status', 'Posted')->where('d.created_at', '>=', $start)
            ->groupBy('p.id', 'p.name', 'p.unit')
            ->select('p.id', 'p.name', 'p.unit')->selectRaw('SUM(l.quantity_milli) as quantity_milli, SUM(l.subtotal_cents) as revenue_cents')
            ->orderByDesc('revenue_cents')->limit(5)->get()
            ->map(fn ($row) => ['id' => (int) $row->id, 'name' => $row->name, 'unit' => $row->unit, 'quantity_milli' => (int) $row->quantity_milli, 'revenue_cents' => (int) $row->revenue_cents])->all();

        return [
            'period' => [
                'days' => $days,
                'revenue_cents' => $current['revenue'],
                'previous_revenue_cents' => $previous['revenue'],
                'gross_profit_cents' => $current['profit'],
                'costed_revenue_cents' => $current['costed_revenue'],
                'documents' => $current['count'],
                'average_sale_cents' => $current['count'] ? intdiv($current['revenue'], $current['count']) : 0,
            ],
            'trend' => $trend,
            'top_products' => $top,
        ];
    }

    private static function posted()
    {
        return DB::table('documents')->whereIn('kind', ['Sale', 'Invoice'])->where('status', 'Posted');
    }

    /**
     * @return array{revenue: int, count: int, profit: int, costed_revenue: int}
     */
    private static function totals(Carbon $from, Carbon $to): array
    {
        $documents = self::posted()->where('created_at', '>=', $from)->where('created_at', '<', $to->copy()->addSecond())
            ->selectRaw('COALESCE(SUM(total_cents),0) as revenue, COUNT(*) as count')->first();
        $lines = DB::table('document_lines as l')->join('documents as d', 'd.id', '=', 'l.document_id')
            ->whereIn('d.kind', ['Sale', 'Invoice'])->where('d.status', 'Posted')
            ->where('d.created_at', '>=', $from)->where('d.created_at', '<', $to->copy()->addSecond())->whereNotNull('l.cogs_cents')
            ->selectRaw('COALESCE(SUM(l.subtotal_cents),0) as revenue, COALESCE(SUM(l.cogs_cents),0) as cogs')->first();

        return [
            'revenue' => (int) $documents->revenue,
            'count' => (int) $documents->count,
            'profit' => (int) $lines->revenue - (int) $lines->cogs,
            'costed_revenue' => (int) $lines->revenue,
        ];
    }
}
