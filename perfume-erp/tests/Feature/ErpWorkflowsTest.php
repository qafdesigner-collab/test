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
}
