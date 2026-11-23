<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $t) {
            $t->boolean('sales_allowed')->default(false);
        });
        DB::table('products')->whereIn('kind', ['finished', 'resale', 'service'])->update(['sales_allowed' => true]);
        Schema::table('batches', function (Blueprint $t) {
            $t->json('cost_sheet')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('products', fn (Blueprint $t) => $t->dropColumn('sales_allowed'));
        Schema::table('batches', fn (Blueprint $t) => $t->dropColumn('cost_sheet'));
    }
};
