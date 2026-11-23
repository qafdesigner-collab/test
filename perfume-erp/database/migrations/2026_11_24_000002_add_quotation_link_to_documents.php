<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', fn (Blueprint $t) => $t->unsignedBigInteger('quotation_id')->nullable()->index());
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $t) {
            $t->dropIndex(['quotation_id']);
            $t->dropColumn('quotation_id');
        });
    }
};
