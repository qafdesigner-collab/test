<?php

namespace App\Services;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Authenticator-app sign-in codes (RFC 6238 TOTP, SHA-1, 6 digits, 30 seconds) and one-time recovery codes.
 * The shared secret is stored encrypted with the application key; recovery codes are stored as SHA-256 hashes.
 */
class TwoFactor
{
    public const ROLES = ['owner', 'manager'];

    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function generateSecret(): string
    {
        return self::base32Encode(random_bytes(20));
    }

    public static function code(string $secret, int $step): string
    {
        $hash = hash_hmac('sha1', pack('J', $step), self::base32Decode($secret), true);
        $offset = ord($hash[19]) & 0x0F;
        $value = ((ord($hash[$offset]) & 0x7F) << 24) | (ord($hash[$offset + 1]) << 16) | (ord($hash[$offset + 2]) << 8) | ord($hash[$offset + 3]);

        return str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Returns the matching time step (current ±1 for clock drift), or null. A step at or before $lastStep is refused so a code cannot be replayed.
     */
    public static function matchStep(string $secret, string $code, ?int $lastStep = null, ?int $time = null): ?int
    {
        $code = preg_replace('/\s+/', '', $code);
        if (! preg_match('/^\d{6}$/', $code)) {
            return null;
        }
        $now = intdiv($time ?? time(), 30);
        foreach ([$now - 1, $now, $now + 1] as $step) {
            if (($lastStep === null || $step > $lastStep) && hash_equals(self::code($secret, $step), $code)) {
                return $step;
            }
        }

        return null;
    }

    public static function uri(string $secret, string $account, string $issuer): string
    {
        $label = rawurlencode($issuer).':'.rawurlencode($account);

        return 'otpauth://totp/'.$label.'?secret='.$secret.'&issuer='.rawurlencode($issuer).'&algorithm=SHA1&digits=6&period=30';
    }

    /** @return array{plain: list<string>, stored: string} */
    public static function recoveryCodes(): array
    {
        $plain = [];
        for ($i = 0; $i < 8; $i++) {
            $raw = strtolower(self::base32Encode(random_bytes(7)));
            $plain[] = substr($raw, 0, 5).'-'.substr($raw, 5, 5);
        }

        return ['plain' => $plain, 'stored' => json_encode(array_map(fn ($c) => hash('sha256', $c), $plain))];
    }

    public static function secretFor(object $user): ?string
    {
        return $user->two_factor_secret ? Crypt::decryptString($user->two_factor_secret) : null;
    }

    public static function enabled(object $user): bool
    {
        return $user->two_factor_confirmed_at !== null && $user->two_factor_secret !== null;
    }

    /**
     * Checks an authenticator code or a recovery code for a user with two-step sign-in switched on, and records its use.
     */
    public static function verify(int $userId, string $input): bool
    {
        return DB::transaction(function () use ($userId, $input) {
            $user = DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            if (! $user || ! self::enabled($user)) {
                return false;
            }
            $input = strtolower(trim($input));
            $step = self::matchStep(self::secretFor($user), $input, $user->two_factor_last_step !== null ? (int) $user->two_factor_last_step : null);
            if ($step !== null) {
                DB::table('users')->where('id', $userId)->update(['two_factor_last_step' => $step]);

                return true;
            }
            $hashes = json_decode((string) $user->two_factor_recovery_codes, true) ?: [];
            $index = array_search(hash('sha256', $input), $hashes, true);
            if ($index === false) {
                return false;
            }
            array_splice($hashes, $index, 1);
            DB::table('users')->where('id', $userId)->update(['two_factor_recovery_codes' => json_encode($hashes)]);

            return true;
        });
    }

    public static function recoveryRemaining(object $user): int
    {
        return count(json_decode((string) $user->two_factor_recovery_codes, true) ?: []);
    }

    private static function base32Encode(string $bytes): string
    {
        $bits = '';
        foreach (str_split($bytes) as $b) {
            $bits .= str_pad(decbin(ord($b)), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            $out .= self::ALPHABET[bindec(str_pad($chunk, 5, '0'))];
        }

        return $out;
    }

    private static function base32Decode(string $text): string
    {
        $bits = '';
        foreach (str_split(strtoupper(rtrim($text, '='))) as $c) {
            $pos = strpos(self::ALPHABET, $c);
            if ($pos !== false) {
                $bits .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
            }
        }
        $out = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $out .= chr(bindec($byte));
            }
        }

        return $out;
    }
}
