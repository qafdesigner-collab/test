<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('document_lines', fn (Blueprint $t) => $t->unsignedBigInteger('received_milli')->default(0));
        Schema::table('documents', fn (Blueprint $t) => $t->unsignedBigInteger('purchase_order_id')->nullable()->index());
    }

    public function down(): void
    {
        Schema::table('document_lines', fn (Blueprint $t) => $t->dropColumn('received_milli'));
        Schema::table('documents', function (Blueprint $t) {
            $t->dropIndex(['purchase_order_id']);
            $t->dropColumn('purchase_order_id');
        });
    }
};
