<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Amounts;
use App\Services\Costing;
use Database\Seeders\PerfumeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class ErpWorkflowsTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create(['role' => 'owner']);
        $this->seed(PerfumeSeeder::class);
        $this->actingAs($this->owner);
    }

    private function postOnce(string $url, array $data, ?string $key = null)
    {
        return $this->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())->postJson($url, $data);
    }

    private function sale(array $extra = []): array
    {
        return $extra + ['kind' => 'Invoice', 'location_id' => 1, 'contact_id' => 1, 'method' => 'Cash', 'paid' => '125.00', 'lines' => [['product_id' => 1, 'quantity' => '1']]];
    }

    public function test_requires_sign_in_and_limits_formula_access(): void
    {
        $this->post('/logout');
        $this->getJson('/api/products')->assertUnauthorized();
        $u = User::factory()->create(['role' => 'cashier']);
        $this->actingAs($u)->getJson('/api/formulas')->assertForbidden();
        $this->postJson('/api/users', ['name' => 'Bad'])->assertForbidden();
    }

    public function test_catalogue_search_matches_internal_inspiration(): void
    {
        $this->getJson('/api/products?search=Coastal')->assertOk()->assertJsonCount(1, 'products')->assertJsonPath('products.0.name', 'Ocean Breeze');
        $this->getJson('/api/products?family=Fresh&audience=Unisex&style=French%20style')->assertOk()->assertJsonCount(2, 'products');
    }

    public function test_decimal_parser_is_exact(): void
    {
        $this->assertSame(101, Amounts::parse('1.01'));
        $this->assertSame(1015, Amounts::parse('1.015', 3));
        $this->assertSame(-1250, Amounts::parse('-1.250', 3, true));
        $this->assertSame(1, Amounts::roundDivide(5, 10));
    }

    public function test_sale_retry_posts_stock_and_payment_once(): void
    {
        $key = (string) Str::uuid();
        $before = (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 1])->sum('quantity_milli');
        $a = $this->postOnce('/api/documents', $this->sale(), $key)->assertOk()->json();
        $b = $this->postOnce('/api/documents', $this->sale(), $key)->assertOk()->json();
        $this->assertSame($a, $b);
        $this->assertDatabaseCount('documents', 1);
        $this->assertDatabaseCount('payments', 1);
        $this->assertSame($before - 1000, (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 1])->sum('quantity_milli'));
    }

    public function test_reused_identifier_for_changed_request_is_rejected(): void
    {
        $key = (string) Str::uuid();
        $this->postOnce('/api/documents', $this->sale(), $key)->assertOk();
        $this->postOnce('/api/documents', $this->sale(['paid' => '0.00', 'method' => 'Credit']), $key)->assertStatus(409);
    }

    public function test_insufficient_stock_rolls_back_entire_document(): void
    {
        $v = $this->sale(['paid' => '0.00', 'method' => 'Credit']);
        $v['lines'] = [['product_id' => 2, 'quantity' => '1'], ['product_id' => 1, 'quantity' => '9999']];
        $before = (int) DB::table('balances')->where(['product_id' => 2, 'location_id' => 1])->sum('quantity_milli');
        $this->postOnce('/api/documents', $v)->assertUnprocessable();
        $this->assertDatabaseCount('documents', 0);
        $this->assertSame($before, (int) DB::table('balances')->where(['product_id' => 2, 'location_id' => 1])->sum('quantity_milli'));
    }

    public function test_credit_limit_and_whole_bottle_rules(): void
    {
        DB::table('contacts')->where('id', 1)->update(['credit_cents' => 0]);
        $this->postOnce('/api/documents', $this->sale(['paid' => '0.00', 'method' => 'Credit']))->assertUnprocessable();
        $v = $this->sale();
        $v['lines'][0]['quantity'] = '0.5';
        $this->postOnce('/api/documents', $v)->assertUnprocessable();
    }

    public function test_quotation_does_not_consume_stock(): void
    {
        $before = (int) DB::table('balances')->where('product_id', 1)->sum('quantity_milli');
        $this->postOnce('/api/documents', $this->sale(['kind' => 'Quotation', 'paid' => '0.00', 'method' => 'Credit']))->assertOk();
        $this->assertSame($before, (int) DB::table('balances')->where('product_id', 1)->sum('quantity_milli'));
    }

    public function test_purchase_receipt_and_transfer_are_atomic(): void
    {
        $this->postOnce('/api/documents', ['kind' => 'Purchase', 'contact_id' => 2, 'location_id' => 1, 'paid' => '0.00', 'method' => 'Credit', 'lines' => [['product_id' => 7, 'quantity' => '100']]])->assertOk();
        $a = (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 1])->sum('quantity_milli');
        $b = (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 2])->sum('quantity_milli');
        $this->postOnce('/api/stock', ['product_id' => 1, 'location_id' => 1, 'target_id' => 2, 'lot' => 'DEMO-OPENING', 'quantity' => '2', 'reason' => 'Transfer test'])->assertOk();
        $this->assertSame($a - 2000, (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 1])->sum('quantity_milli'));
        $this->assertSame($b + 2000, (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 2])->sum('quantity_milli'));
    }

    public function test_full_return_is_once_and_restores_stock(): void
    {
        $before = (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 1])->sum('quantity_milli');
        $id = $this->postOnce('/api/documents', $this->sale())->assertOk()->json('id');
        $this->postOnce('/api/documents/'.$id, ['action' => 'return', 'condition' => 'Restock'])->assertOk();
        $this->postOnce('/api/documents/'.$id, ['action' => 'return', 'condition' => 'Restock'])->assertUnprocessable();
        $this->assertSame($before, (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 1])->sum('quantity_milli'));
    }

    public function test_pos_requires_shift_and_cashier_cannot_override_price(): void
    {
        $u = User::factory()->create(['role' => 'cashier']);
        $this->actingAs($u);
        $v = $this->sale(['kind' => 'Sale']);
        $this->postOnce('/api/documents', $v)->assertUnprocessable();
        $this->postOnce('/api/shifts', ['action' => 'open', 'amount' => '100.00'])->assertOk();
        $v['lines'][0]['price'] = '1.00';
        $this->postOnce('/api/documents', $v)->assertForbidden();
        unset($v['lines'][0]['price']);
        $this->postOnce('/api/documents', $v)->assertOk();
        $this->getJson('/api/shifts')->assertJsonPath('shifts.0.expected_cents', 22500);
    }

    private function formula(): int
    {
        return $this->postJson('/api/formulas', ['code' => 'DEMO-OB', 'name' => 'Ocean recipe', 'product_id' => 1, 'maturation_days' => 0, 'ingredients' => [['product_id' => 7, 'quantity' => '20'], ['product_id' => 8, 'quantity' => '80']], 'packaging' => [['product_id' => 9, 'quantity' => '1']], 'instructions' => 'Demo only'])->assertOk()->json('id');
    }

    public function test_manufacturing_requires_approval_qc_and_actual_output(): void
    {
        $fid = $this->formula();
        $this->postOnce('/api/batches', ['formula_id' => $fid, 'location_id' => 1, 'planned' => 10])->assertUnprocessable();
        $this->postJson('/api/formulas/'.$fid.'/approve')->assertOk();
        $id = $this->postOnce('/api/batches', ['formula_id' => $fid, 'location_id' => 1, 'planned' => 10])->assertOk()->json('id');
        $this->postOnce('/api/batches/'.$id, ['action' => 'complete', 'accepted' => 10, 'rejected' => 0])->assertUnprocessable();
        $this->postOnce('/api/batches/'.$id, ['action' => 'issue'])->assertOk();
        $this->postOnce('/api/batches/'.$id, ['action' => 'mature'])->assertOk();
        $this->postOnce('/api/batches/'.$id, ['action' => 'qc', 'passed' => true, 'qc_notes' => 'Fill and scent checks passed'])->assertOk();
        $before = (int) DB::table('balances')->where('product_id', 1)->sum('quantity_milli');
        $this->postOnce('/api/batches/'.$id, ['action' => 'complete', 'accepted' => 9, 'rejected' => 1, 'loss_reason' => 'One leaking bottle', 'extra_cost' => '15.00'])->assertOk();
        $this->assertSame($before + 9000, (int) DB::table('balances')->where('product_id', 1)->sum('quantity_milli'));
        $this->postOnce('/api/batches/'.$id, ['action' => 'complete', 'accepted' => 9, 'rejected' => 1, 'loss_reason' => 'Again'])->assertUnprocessable();
    }

    public function test_image_upload_and_cover_are_real_files(): void
    {
        Storage::fake('local');
        $this->post('/api/products/1/images', ['image' => UploadedFile::fake()->image('bottle.jpg', 500, 500), 'alt' => 'Bottle'])->assertOk();
        $img = DB::table('images')->first();
        Storage::disk('local')->assertExists([$img->path, $img->thumb]);
        $this->get('/media/image/'.$img->id)->assertOk();
        $this->postJson('/api/images/'.$img->id, ['action' => 'delete'])->assertOk();
        Storage::disk('local')->assertMissing($img->path);
    }

    public function test_artwork_revision_requires_reapproval(): void
    {
        Storage::fake('local');
        $id = $this->postJson('/api/projects', ['name' => 'Gift box', 'type' => 'Packaging', 'brief' => 'Box design', 'charge' => '100.00', 'cost' => '20.00'])->assertOk()->json('id');
        $this->postJson('/api/projects/'.$id, ['action' => 'deliver', 'comment' => 'Ready'])->assertUnprocessable();
        $a = $this->post('/api/projects/'.$id.'/artwork', ['file' => UploadedFile::fake()->image('proof.png')])->assertOk()->json('id');
        $this->postJson('/api/projects/'.$id, ['action' => 'approve', 'artwork_id' => $a, 'comment' => 'Customer authorization recorded'])->assertOk();
        $this->post('/api/projects/'.$id.'/artwork', ['file' => UploadedFile::fake()->image('proof2.png')])->assertOk();
        $this->assertDatabaseHas('projects', ['id' => $id, 'approved_artwork_id' => null, 'status' => 'Review']);
        $this->postJson('/api/projects/'.$id, ['action' => 'approve', 'artwork_id' => $a, 'comment' => 'Old file'])->assertUnprocessable();
    }

    public function test_disabled_user_cannot_use_api(): void
    {
        $u = User::factory()->create(['role' => 'manager', 'active' => false]);
        $this->actingAs($u);
        $this->getJson('/api/bootstrap')->assertForbidden();
        $this->postJson('/api/products', [])->assertForbidden();
    }

    public function test_owner_can_manage_locations_and_disable_other_users(): void
    {
        $this->postJson('/api/locations', ['name' => 'New boutique', 'kind' => 'shop'])->assertOk();
        $this->assertDatabaseHas('locations', ['name' => 'New boutique']);
        $other = User::factory()->create(['role' => 'cashier']);
        $this->postJson('/api/users/'.$other->id, ['active' => false])->assertOk();
        $this->postJson('/api/users/'.$this->owner->id, ['active' => false])->assertUnprocessable();
        $this->actingAs($other->fresh())->getJson('/api/products')->assertForbidden();
    }

    public function test_failed_transfer_leaves_both_locations_unchanged(): void
    {
        $before = (int) DB::table('balances')->sum('quantity_milli');
        $this->postOnce('/api/stock', ['product_id' => 1, 'location_id' => 1, 'target_id' => 2, 'lot' => 'DEMO-OPENING', 'quantity' => '9999', 'reason' => 'Insufficient'])->assertUnprocessable();
        $this->assertSame($before, (int) DB::table('balances')->sum('quantity_milli'));
    }

    public function test_maturing_batch_cannot_be_released_early(): void
    {
        $f = $this->formula();
        DB::table('formulas')->where('id', $f)->update(['maturation_days' => 7]);
        $this->postJson('/api/formulas/'.$f.'/approve')->assertOk();
        $id = $this->postOnce('/api/batches', ['formula_id' => $f, 'location_id' => 1, 'planned' => 2])->assertOk()->json('id');
        $this->postOnce('/api/batches/'.$id, ['action' => 'issue'])->assertOk();
        $this->postOnce('/api/batches/'.$id, ['action' => 'mature'])->assertOk();
        $this->postOnce('/api/batches/'.$id, ['action' => 'qc', 'passed' => true, 'qc_notes' => 'Early'])->assertUnprocessable();
    }

    public function test_manager_payment_cannot_overpay_document(): void
    {
        $id = $this->postOnce('/api/documents', $this->sale(['paid' => '100.00']))->assertOk()->json('id');
        $this->postOnce('/api/documents/'.$id, ['action' => 'payment', 'amount' => '25.01', 'method' => 'Cash'])->assertUnprocessable();
        $this->postOnce('/api/documents/'.$id, ['action' => 'payment', 'amount' => '25.00', 'method' => 'Cash'])->assertOk();
        $this->assertDatabaseHas('documents', ['id' => $id, 'paid_cents' => 12500]);
    }

    public function test_ingredient_sales_opt_in_and_fractional_shared_stock(): void
    {
        $raw = DB::table('products')->where('kind', 'raw')->first();
        $opening = (int) DB::table('balances')->where('product_id', $raw->id)->where('location_id', 1)->sum('quantity_milli');
        $this->postOnce('/api/shifts', ['action' => 'open', 'amount' => '0'])->assertOk();
        $data = ['kind' => 'Sale', 'location_id' => 1, 'lines' => [['product_id' => $raw->id, 'quantity' => '0.5']], 'paid' => '1', 'method' => 'Cash'];
        $this->postOnce('/api/documents', $data)->assertStatus(422);
        DB::table('products')->where('id', $raw->id)->update(['sales_allowed' => true, 'price_cents' => 200, 'tax_bp' => 0]);
        $this->postOnce('/api/documents', $data)->assertOk();
        $this->assertEquals($opening - 500, (int) DB::table('balances')->where('product_id', $raw->id)->where('location_id', 1)->sum('quantity_milli'));
    }

    public function test_completed_cost_sheet_recalculates_accepted_output_and_extras(): void
    {
        $issued = ['rows' => [], 'ingredients_cents' => 1000, 'packaging_cents' => 500, 'total_cents' => 1500, 'output' => 10, 'unit_cost_cents' => 150, 'extras' => []];
        $actual = Costing::finish($issued, 1500, ['labour_cents' => 800, 'overhead_cents' => 200], 8);
        $this->assertEquals(2500, $actual['total_cents']);
        $this->assertEquals(313, $actual['unit_cost_cents']);
        $this->assertEquals(8, $actual['output']);
        $this->assertEquals(800, $actual['extras']['labour_cents']);
        $this->assertEquals(1500, $issued['total_cents']);
    }

    public function test_purchase_lot_cost_flows_through_oil_sales_and_returns(): void
    {
        DB::table('balances')->where('product_id', 7)->update(['quantity_milli' => 0, 'value_cents' => 0]);
        DB::table('products')->where('id', 7)->update(['sales_allowed' => true, 'tax_bp' => 0]);
        $this->postOnce('/api/documents', ['kind' => 'Purchase', 'location_id' => 1, 'contact_id' => 2, 'paid' => '0', 'method' => 'Credit', 'bill_reference' => 'SUP-987', 'lines' => [['product_id' => 7, 'quantity' => '100', 'price' => '2', 'discount' => '10']]])->assertOk();
        $sale = $this->postOnce('/api/documents', ['kind' => 'Invoice', 'location_id' => 1, 'paid' => '100', 'method' => 'Cash', 'lines' => [['product_id' => 7, 'quantity' => '20', 'price' => '5']]])->assertOk()->json('id');
        $this->getJson('/api/documents/'.$sale)->assertJsonPath('profit.cogs_cents', 3800)->assertJsonPath('profit.gross_profit_cents', 6200)->assertJsonPath('profit.estimated', false);
        DB::table('products')->where('id', 7)->update(['cost_cents' => 99999]);
        $this->getJson('/api/documents/'.$sale)->assertJsonPath('profit.cogs_cents', 3800);
        $this->getJson('/api/profitability')->assertJsonPath('gross_profit_cents', 6200);
        $this->postOnce('/api/documents/'.$sale, ['action' => 'return', 'condition' => 'Restock'])->assertOk();
        $this->assertEquals(19000, DB::table('balances')->where('product_id', 7)->sum('value_cents'));
        $this->getJson('/api/profitability')->assertJsonPath('gross_profit_cents', 0);
    }

    public function test_supplier_cost_becomes_production_cost_and_invoice_profit(): void
    {
        DB::table('balances')->whereIn('product_id', [1, 7, 8, 9])->update(['quantity_milli' => 0, 'value_cents' => 0]);
        DB::table('products')->whereIn('id', [1, 7, 8, 9])->update(['tax_bp' => 0]);
        $this->postOnce('/api/documents', ['kind' => 'Purchase', 'location_id' => 1, 'contact_id' => 2, 'paid' => '0', 'method' => 'Credit', 'lines' => [['product_id' => 7, 'quantity' => '200', 'price' => '2'], ['product_id' => 8, 'quantity' => '800', 'price' => '0.10'], ['product_id' => 9, 'quantity' => '10', 'price' => '3']]])->assertOk();
        $f = $this->formula();
        $this->postJson('/api/formulas/'.$f.'/approve')->assertOk();
        $b = $this->postOnce('/api/batches', ['formula_id' => $f, 'location_id' => 1, 'planned' => 10])->assertOk()->json('id');
        foreach (['issue', 'mature'] as $action) {
            $this->postOnce('/api/batches/'.$b, ['action' => $action])->assertOk();
        }
        $this->postOnce('/api/batches/'.$b, ['action' => 'qc', 'passed' => true, 'qc_notes' => 'Pass'])->assertOk();
        $this->postOnce('/api/batches/'.$b, ['action' => 'complete', 'accepted' => 10, 'rejected' => 0, 'labour_cost' => '10'])->assertOk();
        $this->assertEquals(52000, DB::table('balances')->where('product_id', 1)->sum('value_cents'));
        $sale = $this->postOnce('/api/documents', ['kind' => 'Invoice', 'location_id' => 1, 'paid' => '200', 'method' => 'Cash', 'lines' => [['product_id' => 1, 'quantity' => '2', 'price' => '100']]])->assertOk()->json('id');
        $this->getJson('/api/documents/'.$sale)->assertJsonPath('profit.cogs_cents', 10400)->assertJsonPath('profit.gross_profit_cents', 9600)->assertJsonPath('profit.estimated', false);
        $cashier = User::factory()->create(['role' => 'cashier']);
        DB::table('documents')->where('id', $sale)->update(['user_id' => $cashier->id]);
        $this->actingAs($cashier)->getJson('/api/documents/'.$sale)->assertJsonMissingPath('lines.0.cogs_cents')->assertJsonPath('profit', null);
        $this->getJson('/api/profitability')->assertForbidden();
    }

    public function test_invoice_keeps_company_and_contact_snapshots(): void
    {
        $id = $this->postOnce('/api/documents', $this->sale(['bill_reference' => 'CUSTOMER-PO-10', 'due_date' => '2026-11-01']))->assertOk()->json('id');
        DB::table('contacts')->where('id', 1)->update(['name' => 'Changed name']);
        $this->getJson('/api/documents/'.$id)->assertJsonPath('document.bill_reference', 'CUSTOMER-PO-10')->assertJsonPath('document.due_date', '2026-11-01');
        $this->assertNotEquals('Changed name', $this->getJson('/api/documents/'.$id)->json('contact.name'));
    }

    public function test_fragrance_profile_saves_separate_note_layers(): void
    {
        $profile = ['top_notes' => ['Bergamot', 'Lemon'], 'heart_notes' => ['Rose'], 'base_notes' => ['Musk'], 'smell_description' => 'Fresh opening with a soft floral heart.', 'intensity' => 'Medium', 'longevity' => 'Observed 6 hours', 'projection' => 'Moderate', 'season' => 'Summer', 'occasion' => 'Office'];
        $data = ['name' => 'Profile perfume', 'sku' => 'PROFILE-TEST', 'kind' => 'finished', 'unit' => 'bottle', 'price' => '100', 'cost' => '25', 'tax' => '0', 'reorder' => '5', 'families' => ['Fresh'], 'notes' => [], 'tags' => [], 'active' => true, 'sales_allowed' => true, 'fragrance_profile' => $profile];
        $id = $this->postJson('/api/products', $data)->assertOk()->json('id');
        $product = collect($this->getJson('/api/products')->json('products'))->firstWhere('id', $id);
        $this->assertEquals($profile, $product['fragrance_profile']);
        $data['sku'] = 'PROFILE-BAD';
        $data['fragrance_profile']['base_notes'] = 'Musk';
        $this->postJson('/api/products', $data)->assertUnprocessable();
    }

    public function test_customer_product_dossier_links_and_workflow_gates(): void
    {
        $id = $this->postJson('/api/projects', ['name' => 'Customer perfume', 'type' => 'Private Label', 'contact_id' => 1, 'product_id' => 1, 'supplier_id' => 2, 'brief' => 'Customer packaging', 'charge' => '200', 'cost' => '50'])->assertOk()->json('id');
        $this->getJson('/api/customers/1/360')->assertJsonPath('products.0.id', 1)->assertJsonPath('projects.0.supplier.id', 2);
        $this->postOnce('/api/projects/'.$id.'/workflow', ['stage' => 'packaging_ready', 'notes' => 'Premature'])->assertUnprocessable();
        $this->postOnce('/api/projects/'.$id.'/workflow', ['stage' => 'vendor_started', 'notes' => 'Supplier started', 'performed_at' => '2026-10-01T10:00:00Z'])->assertOk();
        $this->postOnce('/api/projects/'.$id.'/workflow', ['stage' => 'vendor_finished', 'notes' => 'Done', 'performed_at' => '2026-09-30T10:00:00Z'])->assertUnprocessable();
        $this->postOnce('/api/projects/'.$id.'/workflow', ['stage' => 'vendor_finished', 'notes' => 'Done', 'performed_at' => '2026-10-02T10:00:00Z'])->assertOk();
        Storage::fake('local');
        $file = UploadedFile::fake()->image('box.png');
        $this->post('/api/projects/'.$id.'/artwork', ['file' => $file])->assertOk();
        $art = DB::table('artworks')->where('project_id', $id)->value('id');
        $this->postJson('/api/projects/'.$id, ['action' => 'approve', 'artwork_id' => $art, 'comment' => 'Approved'])->assertOk();
        $this->postOnce('/api/projects/'.$id.'/workflow', ['stage' => 'packaging_ready', 'notes' => 'Boxes ready'])->assertOk();
        $this->getJson('/api/products/1/360')->assertJsonPath('projects.0.approved_artwork_id', $art)->assertJsonPath('projects.0.workflow_events.2.stage', 'packaging_ready');
        $this->post('/api/projects/'.$id.'/artwork', ['file' => UploadedFile::fake()->image('new-box.png')])->assertOk();
        $this->postOnce('/api/projects/'.$id.'/workflow', ['stage' => 'delivered', 'notes' => 'Attempt'])->assertUnprocessable();
        $designer = User::factory()->create(['role' => 'designer']);
        $this->actingAs($designer)->getJson('/api/customers/1/360')->assertForbidden();
    }

    public function test_every_read_endpoint_loads_after_a_sale(): void
    {
        $this->postOnce('/api/documents', $this->sale())->assertOk();
        foreach (['dashboard', 'products', 'references', 'contacts', 'inventory', 'documents', 'documents/1', 'formulas', 'batches', 'projects', 'shifts', 'settings', 'users', 'staff', 'audit', 'customers/1/360', 'products/1/360', 'profitability', 'bootstrap'] as $endpoint) {
            $this->getJson('/api/'.$endpoint)->assertOk();
        }
        $dashboard = $this->getJson('/api/dashboard')->json();
        $this->assertIsInt($dashboard['revenue_cents']);
        $this->assertIsInt($dashboard['outstanding_cents']);
    }

    public function test_dashboard_sales_metrics_and_role_restriction(): void
    {
        $sale = $this->postOnce('/api/documents', $this->sale())->assertOk()->json();
        $total = DB::table('documents')->where('id', $sale['id'] ?? DB::table('documents')->max('id'))->value('total_cents');
        DB::table('documents')->insert(['uuid' => (string) Str::uuid(), 'number' => 'OLD-1', 'kind' => 'Invoice', 'status' => 'Posted', 'location_id' => 1, 'user_id' => $this->owner->id, 'subtotal_cents' => 5000, 'tax_cents' => 0, 'total_cents' => 5000, 'created_at' => now()->subDays(40), 'updated_at' => now()->subDays(40)]);

        $sales = $this->getJson('/api/dashboard')->assertOk()->json('sales');
        $this->assertSame((int) $total, $sales['period']['revenue_cents']);
        $this->assertSame(5000, $sales['period']['previous_revenue_cents']);
        $this->assertSame(1, $sales['period']['documents']);
        $this->assertCount(14, $sales['trend']);
        $this->assertSame((int) $total, end($sales['trend'])['total']);
        $this->assertSame(1, $sales['top_products'][0]['id']);

        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->assertNull($this->getJson('/api/dashboard')->assertOk()->json('sales'));
    }

    public function test_pos_split_payment_with_cash_change_and_refund(): void
    {
        $this->postOnce('/api/shifts', ['action' => 'open', 'amount' => '50.00'])->assertOk();
        $sale = ['kind' => 'Sale', 'location_id' => 1, 'contact_id' => null, 'lines' => [['product_id' => 1, 'quantity' => '1']], 'payments' => [['method' => 'Cash', 'amount' => '40.00'], ['method' => 'Card', 'amount' => '85.00']], 'tendered' => '50.00'];

        $this->postOnce('/api/documents', ['tendered' => '30.00'] + $sale)->assertUnprocessable();
        $this->postOnce('/api/documents', ['payments' => [['method' => 'Card', 'amount' => '125.00']], 'tendered' => '200'] + $sale)->assertUnprocessable();
        $this->postOnce('/api/documents', ['payments' => [['method' => 'Card', 'amount' => '200.00']], 'tendered' => null] + $sale)->assertUnprocessable();

        $posted = $this->postOnce('/api/documents', $sale)->assertOk()->assertJsonPath('change_cents', 1000)->json();
        $document = DB::table('documents')->find($posted['id']);
        $this->assertSame('Split', $document->method);
        $this->assertSame(12500, (int) $document->paid_cents);
        $this->assertSame(5000, (int) $document->tendered_cents);
        $this->assertSame(['Card' => 8500, 'Cash' => 4000], DB::table('payments')->where('document_id', $posted['id'])->orderBy('method')->pluck('amount_cents', 'method')->map(fn ($v) => (int) $v)->all());
        $this->getJson('/api/shifts')->assertJsonPath('shifts.0.expected_cents', 9000);

        $this->postOnce('/api/documents/'.$posted['id'], ['action' => 'return', 'condition' => 'Restock'])->assertOk();
        $this->assertSame(4000, (int) DB::table('documents')->where('kind', 'Return')->value('cash_refund_cents'));
        $this->getJson('/api/shifts')->assertJsonPath('shifts.0.expected_cents', 5000);
    }

    public function test_quotation_converts_once_to_invoice_at_quoted_prices(): void
    {
        $quote = $this->postOnce('/api/documents', ['kind' => 'Quotation', 'contact_id' => 1, 'location_id' => 1, 'method' => 'Credit', 'paid' => '0', 'lines' => [['product_id' => 1, 'quantity' => '2', 'price' => '120.00', 'discount' => '10.00']]])->assertOk()->json();
        DB::table('products')->where('id', 1)->update(['price_cents' => 99900]);
        $stock = (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 1])->sum('quantity_milli');

        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $this->postOnce('/api/documents/'.$quote['id'], ['action' => 'convert'])->assertForbidden();
        $this->actingAs($this->owner);

        $invoice = $this->postOnce('/api/documents/'.$quote['id'], ['action' => 'convert'])->assertOk()->json();
        $this->assertSame(23000, $invoice['total_cents']);
        $line = DB::table('document_lines')->where('document_id', $invoice['id'])->first();
        $this->assertSame([2000, 12000, 1000], [(int) $line->quantity_milli, (int) $line->price_cents, (int) $line->discount_cents]);
        $this->assertSame('Invoiced', DB::table('documents')->where('id', $quote['id'])->value('status'));
        $this->assertSame($quote['id'], (int) DB::table('documents')->where('id', $invoice['id'])->value('quotation_id'));
        $this->assertSame($stock - 2000, (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 1])->sum('quantity_milli'));
        $this->getJson('/api/documents/'.$quote['id'])->assertJsonPath('invoice.number', $invoice['number']);

        $this->postOnce('/api/documents/'.$quote['id'], ['action' => 'convert'])->assertUnprocessable();
    }

    private function returnItems(int $documentId, array $lines, ?string $method = 'Cash')
    {
        return $this->postOnce('/api/documents/'.$documentId, ['action' => 'return', 'condition' => 'Restock', 'refund_method' => $method, 'lines' => $lines]);
    }

    public function test_partial_returns_on_a_paid_pos_sale_refund_and_restock(): void
    {
        $this->postOnce('/api/shifts', ['action' => 'open', 'amount' => '0'])->assertOk();
        $sale = $this->postOnce('/api/documents', ['kind' => 'Sale', 'location_id' => 1, 'lines' => [['product_id' => 1, 'quantity' => '3']], 'payments' => [['method' => 'Cash', 'amount' => '375.00']]])->assertOk()->json();
        $line = DB::table('document_lines')->where('document_id', $sale['id'])->first();
        $stock = fn () => (int) DB::table('balances')->where(['product_id' => 1, 'location_id' => 1])->sum('quantity_milli');
        $before = $stock();

        $this->returnItems($sale['id'], [['line_id' => $line->id, 'quantity' => '4']])->assertUnprocessable();
        $this->returnItems($sale['id'], [['line_id' => $line->id, 'quantity' => '1']], null)->assertUnprocessable();
        $first = $this->returnItems($sale['id'], [['line_id' => $line->id, 'quantity' => '1']])->assertOk()->assertJsonPath('refund_cents', 12500)->json();
        $this->assertSame($before + 1000, $stock());
        $this->assertSame(12500, (int) DB::table('documents')->where('id', $first['id'])->value('cash_refund_cents'));
        $this->getJson('/api/shifts')->assertJsonPath('shifts.0.expected_cents', 25000);
        $this->assertSame(25000, $this->getJson('/api/dashboard')->json('sales.period.revenue_cents'));
        $product = collect($this->getJson('/api/profitability')->json('products'))->firstWhere('product_id', 1);
        $this->assertSame(2000, $product['sold_milli']);

        $this->postOnce('/api/documents/'.$sale['id'], ['action' => 'return', 'condition' => 'Restock'])->assertUnprocessable();
        $this->returnItems($sale['id'], [['line_id' => $line->id, 'quantity' => '2']])->assertOk()->assertJsonPath('refund_cents', 25000);
        $this->returnItems($sale['id'], [['line_id' => $line->id, 'quantity' => '1']])->assertUnprocessable();
        $this->assertSame(0, $this->getJson('/api/dashboard')->json('sales.period.revenue_cents'));
        $this->getJson('/api/shifts')->assertJsonPath('shifts.0.expected_cents', 0);
    }

    public function test_partial_return_on_credit_invoices_reduces_balance_before_refunding(): void
    {
        $invoice = $this->postOnce('/api/documents', $this->sale(['paid' => '0', 'method' => 'Credit', 'lines' => [['product_id' => 1, 'quantity' => '2']]]))->assertOk()->json();
        $line = DB::table('document_lines')->where('document_id', $invoice['id'])->first();
        $this->returnItems($invoice['id'], [['line_id' => $line->id, 'quantity' => '1']], null)->assertOk()->assertJsonPath('refund_cents', 0);
        $this->assertSame(12500, $this->getJson('/api/dashboard')->json('outstanding_cents'));

        $partPaid = $this->postOnce('/api/documents', $this->sale(['paid' => '100.00', 'method' => 'Cash', 'lines' => [['product_id' => 1, 'quantity' => '2']]]))->assertOk()->json();
        $line = DB::table('document_lines')->where('document_id', $partPaid['id'])->first();
        $this->returnItems($partPaid['id'], [['line_id' => $line->id, 'quantity' => '1']], null)->assertOk()->assertJsonPath('refund_cents', 0);
        $this->returnItems($partPaid['id'], [['line_id' => $line->id, 'quantity' => '1']], 'Bank')->assertOk()->assertJsonPath('refund_cents', 10000);
        $document = DB::table('documents')->find($partPaid['id']);
        $this->assertSame([25000, 10000], [(int) $document->returned_cents, (int) $document->refunded_cents]);
        $this->assertSame(12500, $this->getJson('/api/dashboard')->json('outstanding_cents'));
    }

    public function test_purchase_order_is_received_in_parts_at_ordered_prices(): void
    {
        $order = ['kind' => 'PurchaseOrder', 'contact_id' => 2, 'location_id' => 1, 'method' => 'Credit', 'paid' => '0', 'lines' => [['product_id' => 7, 'quantity' => '5', 'price' => '4.00']]];
        $stock = fn () => (int) DB::table('balances')->where(['product_id' => 7, 'location_id' => 1])->sum('quantity_milli');
        $before = $stock();

        $this->postOnce('/api/documents', ['contact_id' => null] + $order)->assertUnprocessable();
        $this->postOnce('/api/documents', ['paid' => '5.00', 'method' => 'Cash'] + $order)->assertUnprocessable();
        $po = $this->postOnce('/api/documents', $order)->assertOk()->json();
        $this->assertStringStartsWith('PO-', $po['number']);
        $this->assertSame('Ordered', DB::table('documents')->where('id', $po['id'])->value('status'));
        $this->assertSame($before, $stock());
        $line = DB::table('document_lines')->where('document_id', $po['id'])->first();
        DB::table('products')->where('id', 7)->update(['cost_cents' => 99900]);

        $receive = fn (string $qty) => $this->postOnce('/api/documents/'.$po['id'], ['action' => 'receive', 'location_id' => 1, 'bill_reference' => 'DN-1', 'lines' => [['line_id' => $line->id, 'quantity' => $qty]]]);
        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $receive('1')->assertForbidden();
        $this->actingAs(User::factory()->create(['role' => 'warehouse']));

        $receive('6')->assertUnprocessable();
        $first = $receive('2')->assertOk()->assertJsonPath('order_status', 'Partially received')->json();
        $this->assertSame($before + 2000, $stock());
        $receipt = DB::table('documents')->find($first['id']);
        $this->assertSame(['Purchase', 800, $po['id']], [$receipt->kind, (int) $receipt->total_cents, (int) $receipt->purchase_order_id]);

        $receive('3')->assertOk()->assertJsonPath('order_status', 'Received');
        $this->assertSame($before + 5000, $stock());
        $receive('1')->assertUnprocessable();
        $this->actingAs($this->owner);
        $this->getJson('/api/documents/'.$po['id'])->assertJsonCount(2, 'receipts');
        $this->postOnce('/api/documents/'.$po['id'], ['action' => 'close'])->assertUnprocessable();
    }

    public function test_purchase_orders_can_be_cancelled_or_closed(): void
    {
        $order = ['kind' => 'PurchaseOrder', 'contact_id' => 2, 'location_id' => 1, 'method' => 'Credit', 'paid' => '0', 'lines' => [['product_id' => 7, 'quantity' => '5']]];
        $cancel = $this->postOnce('/api/documents', $order)->json();
        $this->postOnce('/api/documents/'.$cancel['id'], ['action' => 'close'])->assertOk()->assertJsonPath('status', 'Cancelled');

        $partial = $this->postOnce('/api/documents', $order)->json();
        $line = DB::table('document_lines')->where('document_id', $partial['id'])->first();
        $this->postOnce('/api/documents/'.$partial['id'], ['action' => 'receive', 'location_id' => 1, 'lines' => [['line_id' => $line->id, 'quantity' => '1']]])->assertOk();
        $this->postOnce('/api/documents/'.$partial['id'], ['action' => 'close'])->assertOk()->assertJsonPath('status', 'Closed');
        $this->postOnce('/api/documents/'.$partial['id'], ['action' => 'receive', 'location_id' => 1, 'lines' => [['line_id' => $line->id, 'quantity' => '1']]])->assertUnprocessable();
    }

    public function test_supplier_return_reduces_stock_payable_and_records_refund(): void
    {
        $receipt = $this->postOnce('/api/documents', ['kind' => 'Purchase', 'contact_id' => 2, 'location_id' => 1, 'paid' => '0', 'method' => 'Credit', 'lines' => [['product_id' => 7, 'quantity' => '10', 'price' => '3.00']]])->assertOk()->json();
        $line = DB::table('document_lines')->where('document_id', $receipt['id'])->first();
        $lot = fn () => (int) DB::table('balances')->where(['product_id' => 7, 'location_id' => 1, 'lot' => $receipt['number']])->value('quantity_milli');
        $back = fn (string $qty, ?string $method = null) => $this->postOnce('/api/documents/'.$receipt['id'], ['action' => 'supplier_return', 'reason' => 'Damaged', 'refund_method' => $method, 'lines' => [['line_id' => $line->id, 'quantity' => $qty]]]);

        $this->actingAs(User::factory()->create(['role' => 'cashier']));
        $back('1')->assertForbidden();
        $this->actingAs($this->owner);

        $back('11')->assertUnprocessable();
        $first = $back('4')->assertOk()->assertJsonPath('refund_cents', 0)->json();
        $this->assertStringStartsWith('SRN-', $first['number']);
        $this->assertSame(6000, $lot());
        $this->postOnce('/api/documents/'.$receipt['id'], ['action' => 'payment', 'amount' => '18.01', 'method' => 'Bank'])->assertUnprocessable();
        $this->postOnce('/api/documents/'.$receipt['id'], ['action' => 'payment', 'amount' => '18.00', 'method' => 'Bank'])->assertOk();

        $back('2')->assertUnprocessable();
        $back('2', 'Bank')->assertOk()->assertJsonPath('refund_cents', 600);
        $this->assertSame(4000, $lot());
        $product = collect($this->getJson('/api/profitability')->json('products'))->firstWhere('product_id', 7);
        $this->assertSame(4000, $product['purchased_milli']);
        $this->getJson('/api/documents/'.$first['id'])->assertJsonPath('original.number', $receipt['number']);
    }

    public function test_payment_after_partial_return_cannot_exceed_new_balance(): void
    {
        $invoice = $this->postOnce('/api/documents', $this->sale(['paid' => '0', 'method' => 'Credit', 'lines' => [['product_id' => 1, 'quantity' => '2']]]))->assertOk()->json();
        $line = DB::table('document_lines')->where('document_id', $invoice['id'])->first();
        $this->postOnce('/api/documents/'.$invoice['id'], ['action' => 'return', 'condition' => 'Restock', 'lines' => [['line_id' => $line->id, 'quantity' => '1']]])->assertOk();
        $this->postOnce('/api/documents/'.$invoice['id'], ['action' => 'payment', 'amount' => '125.01', 'method' => 'Cash'])->assertUnprocessable();
        $this->postOnce('/api/documents/'.$invoice['id'], ['action' => 'payment', 'amount' => '125.00', 'method' => 'Cash'])->assertOk();
    }

    public function test_server_messages_follow_the_chosen_language(): void
    {
        $this->withHeader('X-Locale', 'ar');
        $this->postOnce('/api/documents', $this->sale(['paid' => '0', 'method' => 'Credit', 'contact_id' => null]))
            ->assertUnprocessable()->assertJsonPath('errors.document.0', 'يجب اختيار عميل للبيع الآجل.');
        $this->postJson('/api/settings', ['currency' => 'AED'])->assertUnprocessable()->assertJsonPath('errors.company_name.0', 'حقل اسم الشركة مطلوب.');

        $this->withHeader('X-Locale', 'en');
        $this->postOnce('/api/documents', $this->sale(['paid' => '0', 'method' => 'Credit', 'contact_id' => null]))
            ->assertJsonPath('errors.document.0', 'A customer is required for credit sales.');

        $this->post('/logout');
        $this->flushHeaders();
        $this->withUnencryptedCookie('atelier_lang', 'ar')->get('/login')->assertOk()->assertSee('dir="rtl"', false)->assertSee('الدخول إلى مساحة العمل');
        $this->withUnencryptedCookie('atelier_lang', 'en')->get('/login')->assertSee('Sign in to your workspace');
    }

    public function test_tax_invoice_keeps_arabic_names_and_vat_settings(): void
    {
        $this->postJson('/api/settings', ['company_name' => 'Noor Perfumes', 'currency' => 'AED', 'tax_id' => '100123456700003', 'vat_registered' => '1', 'company_name_ar' => 'عطور نور', 'address_ar' => 'دبي'])->assertOk();
        $this->postJson('/api/settings', ['company_name' => 'Noor Perfumes', 'currency' => 'AED', 'vat_registered' => 'yes'])->assertUnprocessable();
        DB::table('products')->where('id', 1)->update(['name_ar' => 'نسيم المحيط']);

        $invoice = $this->postOnce('/api/documents', $this->sale())->assertOk()->json();
        DB::table('products')->where('id', 1)->update(['name_ar' => 'اسم جديد']);
        $document = $this->getJson('/api/documents/'.$invoice['id'])->assertOk();
        $document->assertJsonPath('lines.0.name_ar', 'نسيم المحيط');
        $snapshot = json_decode($document->json('document.seller_snapshot'), true);
        $this->assertSame(['1', 'عطور نور', '100123456700003'], [$snapshot['vat_registered'], $snapshot['company_name_ar'], $snapshot['tax_id']]);
    }
}
