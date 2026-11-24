<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

final class Loyalty
{
    /**
     * @return array{enabled: bool, points_per_aed: int, point_value_cents: int}
     */
    public static function settings(): array
    {
        $s = DB::table('settings')->whereIn('key', ['loyalty_enabled', 'loyalty_points_per_aed', 'loyalty_point_value_fils'])->pluck('value', 'key');

        return [
            'enabled' => ($s['loyalty_enabled'] ?? '0') === '1',
            'points_per_aed' => max(0, (int) ($s['loyalty_points_per_aed'] ?? 1)),
            'point_value_cents' => max(1, (int) ($s['loyalty_point_value_fils'] ?? 5)),
        ];
    }

    public static function balance(int $contactId): int
    {
        return (int) DB::table('loyalty_transactions')->where('contact_id', $contactId)->sum('points');
    }

    public static function record(int $contactId, ?int $documentId, int $points, string $reason, ?int $user): void
    {
        if ($points !== 0) {
            DB::table('loyalty_transactions')->insert(['contact_id' => $contactId, 'document_id' => $documentId, 'points' => $points, 'reason' => $reason, 'user_id' => $user, 'created_at' => now()]);
        }
    }

    /**
     * Points for a redemption payment. The amount must be a whole number of points the customer has.
     */
    public static function pointsFor(int $contactId, int $amountCents): int
    {
        $settings = self::settings();
        if (! $settings['enabled']) {
            Documents::fail(__('Loyalty points are not enabled.'));
        }
        if ($amountCents % $settings['point_value_cents']) {
            Documents::fail(__('Points can only pay whole points.'));
        }
        $points = intdiv($amountCents, $settings['point_value_cents']);
        if ($points > self::balance($contactId)) {
            Documents::fail(__('The customer does not have enough loyalty points.'));
        }

        return $points;
    }

    /**
     * Points earned on the part of a sale not paid with points.
     */
    public static function earnedFor(int $totalCents, int $pointsPaidCents): int
    {
        $settings = self::settings();

        return $settings['enabled'] ? intdiv(max(0, $totalCents - $pointsPaidCents) * $settings['points_per_aed'], 100) : 0;
    }

    /**
     * Take back points earned on returned items, proportionally to the share of the sale now returned.
     */
    public static function reverseEarned(object $document, int $returnedCents, ?int $user): void
    {
        if (! $document->contact_id || $document->total_cents <= 0) {
            return;
        }
        $earned = (int) DB::table('loyalty_transactions')->where('document_id', $document->id)->where('reason', 'earn')->sum('points');
        $reversed = -(int) DB::table('loyalty_transactions')->where('document_id', $document->id)->where('reason', 'return')->sum('points');
        $target = intdiv($earned * min($returnedCents, (int) $document->total_cents), (int) $document->total_cents);
        self::record((int) $document->contact_id, (int) $document->id, -max(0, $target - $reversed), 'return', $user);
    }

    /**
     * When money is owed back, give back points first up to what the sale was paid with in points,
     * so points never turn into cash. Returns the money part of the refund.
     */
    public static function splitRefund(object $document, int $refundCents, ?int $user): int
    {
        if (! $document->contact_id || $refundCents <= 0) {
            return $refundCents;
        }
        $value = self::settings()['point_value_cents'];
        $paidWithPoints = (int) DB::table('payments')->where('document_id', $document->id)->where('method', 'Points')->sum('amount_cents');
        $restoredCents = (int) DB::table('loyalty_transactions')->where('document_id', $document->id)->where('reason', 'restore')->sum('points') * $value;
        $pointsPart = min($refundCents, max(0, $paidWithPoints - $restoredCents));
        $points = intdiv($pointsPart, $value);
        self::record((int) $document->contact_id, (int) $document->id, $points, 'restore', $user);

        return $refundCents - $points * $value;
    }
}
