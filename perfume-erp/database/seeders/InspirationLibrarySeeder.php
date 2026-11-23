<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class InspirationLibrarySeeder extends Seeder
{
    /**
     * Add library references that are missing. Existing rows (including staff edits) are never overwritten.
     */
    public function run(): void
    {
        $added = 0;
        foreach (require database_path('data/inspiration_library.php') as [$brand, $name, $gender, $family, $segment, $notes]) {
            $added += DB::table('references')->insertOrIgnore([
                'brand' => $brand, 'name' => $name, 'gender' => $gender, 'family' => $family,
                'segment' => $segment, 'notes' => $notes, 'library' => true,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        $this->command?->info("Inspiration library: {$added} references added.");
    }
}
