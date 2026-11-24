<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ReferenceLibrary
{
    public const COLUMNS = ['brand', 'name', 'gender', 'family', 'top_notes', 'heart_notes', 'base_notes', 'notes'];

    private const MAX_ROWS = 5000;

    /** Header spellings accepted for each column (Excel exports vary). */
    private const ALIASES = [
        'brand' => ['brand', 'house', 'brand name', 'designer'],
        'name' => ['name', 'perfume', 'fragrance', 'perfume name', 'product'],
        'gender' => ['gender', 'for', 'audience', 'sex'],
        'family' => ['family', 'olfactive family', 'scent family', 'type', 'category'],
        'notes' => ['notes', 'key notes', 'description', 'accords'],
        'top_notes' => ['top_notes', 'top', 'top notes', 'head notes', 'opening'],
        'heart_notes' => ['heart_notes', 'heart', 'heart notes', 'middle', 'middle notes', 'mid notes'],
        'base_notes' => ['base_notes', 'base', 'base notes', 'dry down', 'drydown'],
    ];

    /**
     * Import references from a CSV file saved from Excel or Google Sheets.
     * Comma, semicolon and tab separators are detected; a UTF-8 byte-order mark is ignored.
     * Existing brand + name pairs are skipped, or updated when $update is true.
     *
     * @return array{added: int, updated: int, skipped: int, errors: list<array{row: int, message: string}>}
     */
    public static function import(string $path, bool $update): array
    {
        $handle = fopen($path, 'r');
        $first = (string) fgets($handle);
        $first = preg_replace('/^\xEF\xBB\xBF/', '', $first);
        $delimiter = collect([',', ';', "\t"])->sortByDesc(fn ($d) => substr_count($first, $d))->first();
        $headers = array_map(fn ($h) => strtolower(trim((string) $h)), str_getcsv($first, $delimiter));
        $map = [];
        foreach (self::ALIASES as $column => $names) {
            $index = collect($headers)->search(fn ($h) => in_array($h, $names, true));
            if ($index !== false) {
                $map[$column] = $index;
            }
        }
        if (! isset($map['brand'], $map['name'])) {
            fclose($handle);
            throw ValidationException::withMessages(['file' => __('The first row must be a header with at least "brand" and "name" columns. Download the template to see the layout.')]);
        }

        $existing = DB::table('references')->get(['id', 'brand', 'name'])->keyBy(fn ($r) => mb_strtolower(trim($r->brand)).'|'.mb_strtolower(trim($r->name)));
        $result = ['added' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => []];
        $row = 1;
        DB::transaction(function () use ($handle, $delimiter, $map, $update, &$existing, &$result, &$row) {
            while (($cells = fgetcsv($handle, 0, $delimiter)) !== false) {
                $row++;
                if ($row - 1 > self::MAX_ROWS) {
                    $result['errors'][] = ['row' => $row, 'message' => 'Stopped: a file can hold at most '.self::MAX_ROWS.' rows.'];
                    break;
                }
                if (count(array_filter($cells, fn ($c) => trim((string) $c) !== '')) === 0) {
                    continue;
                }
                $value = fn (string $column) => isset($map[$column]) ? trim((string) ($cells[$map[$column]] ?? '')) : '';
                $brand = $value('brand');
                $name = $value('name');
                $family = $value('family');
                $notes = $value('notes');
                $pyramid = ['top_notes' => $value('top_notes'), 'heart_notes' => $value('heart_notes'), 'base_notes' => $value('base_notes')];
                if ($notes === '') {
                    $notes = implode(', ', array_filter($pyramid));
                }
                $problem = match (true) {
                    $brand === '' || $name === '' => 'Brand and name are required.',
                    mb_strlen($brand) > 100 || mb_strlen($name) > 150 => 'Brand (100) or name (150 characters) is too long.',
                    mb_strlen($family) > 80 || mb_strlen($notes) > 2000 => 'Family (80) or notes (2,000 characters) is too long.',
                    max(array_map('mb_strlen', $pyramid)) > 500 => 'Top, heart or base notes are too long (500 characters each).',
                    default => null,
                };
                if ($problem) {
                    if (count($result['errors']) < 50) {
                        $result['errors'][] = ['row' => $row, 'message' => $problem];
                    }

                    continue;
                }
                $data = array_filter(['gender' => self::gender($value('gender')), 'family' => $family ?: null, 'notes' => $notes ?: null] + array_map(fn ($v) => $v ?: null, $pyramid), fn ($v) => $v !== null);
                $key = mb_strtolower($brand).'|'.mb_strtolower($name);
                if ($existing->has($key)) {
                    if ($update && $data) {
                        DB::table('references')->where('id', $existing[$key]->id)->update($data + ['updated_at' => now()]);
                        $result['updated']++;
                    } else {
                        $result['skipped']++;
                    }

                    continue;
                }
                $id = DB::table('references')->insertGetId(['brand' => $brand, 'name' => $name, 'library' => false, 'created_at' => now(), 'updated_at' => now()] + $data);
                $existing[$key] = (object) ['id' => $id, 'brand' => $brand, 'name' => $name];
                $result['added']++;
            }
        });
        fclose($handle);

        return $result;
    }

    /**
     * CSV of every reference (or just the header and examples for a template), safe to open in Excel.
     */
    public static function csv(bool $template): string
    {
        $rows = $template
            ? [['Example House', 'Example Oud Intense', 'Unisex', 'Amber Woody', 'Saffron, bergamot', 'Rose, oud', 'Vanilla, amber, musk', ''], ['Another Brand', 'Fresh Citrus No. 2', 'Men', 'Citrus Aromatic', 'Bergamot, lemon', 'Lavender', 'Cedar', '']]
            : DB::table('references')->orderBy('brand')->orderBy('name')->get()->map(fn ($r) => [$r->brand, $r->name, $r->gender, $r->family, $r->top_notes, $r->heart_notes, $r->base_notes, $r->notes])->all();
        $out = fopen('php://temp', 'w+');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, self::COLUMNS);
        foreach ($rows as $row) {
            fputcsv($out, array_map(fn ($v) => preg_match('/^[=+@\t\r-]/', (string) $v) ? "'".$v : (string) $v, $row));
        }
        rewind($out);

        return stream_get_contents($out);
    }

    private static function gender(string $value): ?string
    {
        return match (strtolower(trim($value))) {
            'men', 'man', 'male', 'm', 'homme', 'pour homme', 'رجالي' => 'Men',
            'women', 'woman', 'female', 'f', 'w', 'femme', 'pour femme', 'نسائي' => 'Women',
            'unisex', 'u', 'both', 'mixed', 'للجنسين' => 'Unisex',
            default => null,
        };
    }
}
