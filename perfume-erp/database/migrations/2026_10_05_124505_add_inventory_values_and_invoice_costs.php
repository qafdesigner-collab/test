<?php

use App\Services\Amounts;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('balances', function (Blueprint $t) {
            $t->bigInteger('value_cents')->nullable();
            $t->string('cost_basis')->default('Opening estimate');
        });
        Schema::table('document_lines', function (Blueprint $t) {
            $t->bigInteger('cogs_cents')->nullable();
            $t->json('cost_allocations')->nullable();
        });
        Schema::table('documents', function (Blueprint $t) {
            $t->json('seller_snapshot')->nullable();
            $t->json('contact_snapshot')->nullable();
            $t->string('bill_reference')->nullable();
            $t->date('due_date')->nullable();
        });
        foreach (DB::table('balances')->get() as $b) {
            $cost = DB::table('products')->where('id', $b->product_id)->value('cost_cents');
            DB::table('balances')->where('id', $b->id)->update(['value_cents' => Amounts::roundDivide($b->quantity_milli * $cost, 1000)]);
        }
    }

    public function down(): void
    {
        Schema::table('balances', fn (Blueprint $t) => $t->dropColumn(['value_cents', 'cost_basis']));
        Schema::table('document_lines', fn (Blueprint $t) => $t->dropColumn(['cogs_cents', 'cost_allocations']));
        Schema::table('documents', fn (Blueprint $t) => $t->dropColumn(['seller_snapshot', 'contact_snapshot', 'bill_reference', 'due_date']));
    }
};
