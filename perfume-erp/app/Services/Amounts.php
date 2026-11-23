<?php

namespace App\Services;

use Illuminate\Validation\ValidationException;

final class Amounts
{
    public static function parse(mixed $value, int $places = 2, bool $signed = false): int
    {
        $s = trim((string) $value);
        $pattern = $signed ? '/^-?\d+(?:\.\d{1,'.$places.'})?$/' : '/^\d+(?:\.\d{1,'.$places.'})?$/';
        if (! preg_match($pattern, $s)) {
            throw ValidationException::withMessages(['amount' => 'Enter a valid number with at most '.$places.' decimal places.']);
        }
        $neg = str_starts_with($s, '-');
        $parts = explode('.', ltrim($s, '-'));
        if (strlen(ltrim($parts[0], '0')) > 9) {
            throw ValidationException::withMessages(['amount' => __('Amount is too large.')]);
        }
        $n = (int) $parts[0] * (10 ** $places) + (int) str_pad($parts[1] ?? '', $places, '0');

        return $neg ? -$n : $n;
    }

    public static function roundDivide(int $n, int $d): int
    {
        return intdiv($n + intdiv($d, 2), $d);
    }

    public static function format(int $n, int $places = 2): string
    {
        $s = $n < 0 ? '-' : '';
        $n = abs($n);

        return $s.intdiv($n, 10 ** $places).'.'.str_pad((string) ($n % (10 ** $places)), $places, '0', STR_PAD_LEFT);
    }
}
