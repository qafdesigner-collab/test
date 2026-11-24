<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\InspirationLibrarySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class InspirationLibraryTest extends TestCase
{
    use RefreshDatabase;

    public function test_library_seeds_once_and_preserves_staff_edits(): void
    {
        $this->seed(InspirationLibrarySeeder::class);
        $count = DB::table('references')->count();
        $this->assertGreaterThan(500, $count);
        $this->assertSame(0, DB::table('references')->whereNull('top_notes')->orWhereNull('heart_notes')->orWhereNull('base_notes')->count());
        $this->assertSame($count, DB::table('references')->where('library', true)->count());

        DB::table('references')->where('brand', 'Creed')->where('name', 'Aventus')->update(['notes' => 'Our own panel notes']);
        $this->seed(InspirationLibrarySeeder::class);

        $this->assertSame($count, DB::table('references')->count());
        $this->assertSame('Our own panel notes', DB::table('references')->where('brand', 'Creed')->where('name', 'Aventus')->value('notes'));
    }

    public function test_staff_can_add_reference_with_profile_but_not_duplicate(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'manager']));
        $data = ['brand' => 'House Example', 'name' => 'Example Oud', 'gender' => 'Unisex', 'family' => 'Woody', 'notes' => 'Oud, rose'];

        $this->postJson('/api/references', $data)->assertOk();
        $this->postJson('/api/references', $data)->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->postJson('/api/references', ['gender' => 'Other'] + $data)->assertUnprocessable()->assertJsonValidationErrors('gender');

        $reference = collect($this->getJson('/api/references')->json('references'))->firstWhere('name', 'Example Oud');
        $this->assertSame('Woody', $reference['family']);
    }

    public function test_cashier_cannot_add_references(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->postJson('/api/references', ['brand' => 'A', 'name' => 'B'])->assertForbidden();
    }

    public function test_csv_import_detects_separator_skips_duplicates_and_reports_bad_rows(): void
    {
        $this->seed(InspirationLibrarySeeder::class);
        $this->actingAs(User::factory()->create(['role' => 'manager']));
        $csv = "\xEF\xBB\xBFHouse;Perfume;For;Scent family;Key notes\n"
            ."Noor House;Desert Rose;women;Floral;Rose, oud\n"
            ."Creed;Aventus;Men;Fruity Chypre;Updated notes\n"
            .";Missing brand;;;\n"
            ."\n"
            ."Noor House;Desert Rose;;;Duplicate in file\n";
        $file = UploadedFile::fake()->createWithContent('library.csv', $csv);

        $result = $this->post('/api/references/import', ['file' => $file], ['Accept' => 'application/json'])->assertOk()->json();
        $this->assertSame([1, 0, 2], [$result['added'], $result['updated'], $result['skipped']]);
        $this->assertSame(4, $result['errors'][0]['row']);
        $added = DB::table('references')->where('name', 'Desert Rose')->first();
        $this->assertSame(['Women', 'Floral', 0], [$added->gender, $added->family, (int) $added->library]);
        $this->assertNotSame('Updated notes', DB::table('references')->where(['brand' => 'Creed', 'name' => 'Aventus'])->value('notes'));

        $again = UploadedFile::fake()->createWithContent('library.csv', "brand,name,notes\nCreed,Aventus,Updated notes\n");
        $this->post('/api/references/import', ['file' => $again, 'update' => '1'], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('updated', 1);
        $this->assertSame('Updated notes', DB::table('references')->where(['brand' => 'Creed', 'name' => 'Aventus'])->value('notes'));

        $noHeader = UploadedFile::fake()->createWithContent('bad.csv', "Creed,Aventus\n");
        $this->post('/api/references/import', ['file' => $noHeader], ['Accept' => 'application/json'])->assertUnprocessable();
    }

    public function test_export_and_template_are_excel_safe_and_restricted(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'manager']));
        DB::table('references')->insert(['brand' => '=HYPERLINK("x")', 'name' => 'Formula test', 'created_at' => now(), 'updated_at' => now()]);
        $csv = $this->get('/api/references/export')->assertOk()->getContent();
        $this->assertStringContainsString('brand,name,gender,family,top_notes,heart_notes,base_notes,notes', $csv);
        $this->assertStringContainsString("\"'=HYPERLINK(\"\"x\"\")\"", $csv);
        $this->assertStringContainsString('Example House', $this->get('/api/references/export?template=1')->getContent());

        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->post('/api/references/import', ['file' => UploadedFile::fake()->createWithContent('a.csv', "brand,name\nA,B\n")], ['Accept' => 'application/json'])->assertForbidden();
    }

    public function test_import_reads_top_heart_and_base_notes(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'manager']));
        $csv = "Brand,Perfume,Gender,Family,Top notes,Middle notes,Base notes\nHouse A,Golden Oud,Unisex,Amber Woody,\"Saffron, bergamot\",\"Rose, oud\",\"Amber, musk\"\n";
        $this->post('/api/references/import', ['file' => UploadedFile::fake()->createWithContent('p.csv', $csv)], ['Accept' => 'application/json'])->assertOk()->assertJson(['added' => 1]);
        $ref = DB::table('references')->where('name', 'Golden Oud')->first();
        $this->assertSame(['Saffron, bergamot', 'Rose, oud', 'Amber, musk'], [$ref->top_notes, $ref->heart_notes, $ref->base_notes]);
        $this->assertSame('Saffron, bergamot, Rose, oud, Amber, musk', $ref->notes);

        $this->postJson('/api/references', ['brand' => 'House B', 'name' => 'Fresh One', 'top_notes' => 'Lemon', 'base_notes' => 'Cedar'])->assertOk();
        $this->assertSame('Lemon, Cedar', DB::table('references')->where('name', 'Fresh One')->value('notes'));
        $this->assertStringContainsString('"Golden Oud",Unisex,"Amber Woody","Saffron, bergamot","Rose, oud","Amber, musk"', $this->get('/api/references/export')->getContent());
    }

    public function test_update_fills_the_pyramid_of_older_bundled_references_only(): void
    {
        $this->seed(InspirationLibrarySeeder::class);
        // An installation from before 0.8.0: bundled rows without a pyramid, one edited by staff.
        DB::table('references')->where('library', true)->update(['top_notes' => null, 'heart_notes' => null, 'base_notes' => null]);
        DB::table('references')->where('brand', 'Creed')->where('name', 'Aventus')->update(['top_notes' => 'Our own top', 'notes' => 'Our own panel notes']);

        $this->seed(InspirationLibrarySeeder::class);

        $sauvage = DB::table('references')->where('brand', 'Dior')->where('name', 'Sauvage EDT')->first();
        $this->assertSame('Ambroxan, cedar, labdanum', $sauvage->base_notes);
        $aventus = DB::table('references')->where('brand', 'Creed')->where('name', 'Aventus')->first();
        $this->assertSame(['Our own top', null, 'Our own panel notes'], [$aventus->top_notes, $aventus->heart_notes, $aventus->notes]);
    }

    public function test_team_photo_is_re_encoded_served_and_removable(): void
    {
        Storage::fake('local');
        $id = DB::table('references')->insertGetId(['brand' => 'House', 'name' => 'Photo Test', 'created_at' => now(), 'updated_at' => now()]);
        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->post("/api/references/{$id}/photo", ['photo' => UploadedFile::fake()->image('b.png', 1600, 1200)], ['Accept' => 'application/json'])->assertForbidden();

        $this->actingAs(User::factory()->create(['role' => 'warehouse']));
        $this->post("/api/references/{$id}/photo", ['photo' => UploadedFile::fake()->createWithContent('x.jpg', 'not an image')], ['Accept' => 'application/json'])->assertUnprocessable();
        $path = $this->post("/api/references/{$id}/photo", ['photo' => UploadedFile::fake()->image('b.png', 1600, 1200)], ['Accept' => 'application/json'])->assertOk()->json('photo_path');
        $this->assertStringEndsWith('.jpg', $path);
        [$w, $h] = getimagesizefromstring(Storage::disk('local')->get($path));
        $this->assertSame([800, 600], [$w, $h]);
        $this->get("/media/reference/{$id}")->assertOk()->assertHeader('Content-Type', 'image/jpeg');

        $this->postJson("/api/references/{$id}/photo", ['remove' => 1])->assertOk();
        Storage::disk('local')->assertMissing($path);
        $this->get("/media/reference/{$id}")->assertNotFound();
    }
}
