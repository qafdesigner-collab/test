<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('document_lines', function (Blueprint $t) {
            $t->unsignedBigInteger('returned_milli')->default(0);
            $t->unsignedBigInteger('returned_subtotal_cents')->default(0);
            $t->unsignedBigInteger('returned_tax_cents')->default(0);
            $t->unsignedBigInteger('returned_cogs_cents')->default(0);
        });
        Schema::table('documents', function (Blueprint $t) {
            $t->unsignedBigInteger('returned_cents')->default(0);
            $t->unsignedBigInteger('refunded_cents')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('document_lines', fn (Blueprint $t) => $t->dropColumn(['returned_milli', 'returned_subtotal_cents', 'returned_tax_cents', 'returned_cogs_cents']));
        Schema::table('documents', fn (Blueprint $t) => $t->dropColumn(['returned_cents', 'refunded_cents']));
    }
};
