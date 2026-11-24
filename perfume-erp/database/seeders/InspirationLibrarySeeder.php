<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class InspirationLibrarySeeder extends Seeder
{
    /**
     * Add library references that are missing, and fill the note pyramid of bundled references that do not have one yet.
     * References added or edited by staff are never overwritten.
     */
    public function run(): void
    {
        $added = 0;
        $filled = 0;
        foreach (require database_path('data/inspiration_library.php') as $row) {
            [$brand, $name, $gender, $family, $segment] = $row;
            $pyramid = count($row) >= 8 ? ['top_notes' => $row[5], 'heart_notes' => $row[6], 'base_notes' => $row[7]] : [];
            $notes = $pyramid ? implode(', ', array_filter($pyramid)) : $row[5];
            $inserted = DB::table('references')->insertOrIgnore([
                'brand' => $brand, 'name' => $name, 'gender' => $gender, 'family' => $family,
                'segment' => $segment, 'notes' => $notes, 'library' => true,
                'created_at' => now(), 'updated_at' => now(),
            ] + $pyramid);
            $added += $inserted;
            if (! $inserted && $pyramid) {
                $filled += DB::table('references')->where('brand', $brand)->where('name', $name)->where('library', true)
                    ->whereNull('top_notes')->whereNull('heart_notes')->whereNull('base_notes')
                    ->update($pyramid + ['family' => $family, 'updated_at' => now()]);
            }
        }
        $this->command?->info("Inspiration library: {$added} references added, {$filled} note pyramids filled.");
    }
}
