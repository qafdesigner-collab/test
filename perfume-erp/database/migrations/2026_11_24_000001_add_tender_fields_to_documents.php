<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $t) {
            $t->unsignedBigInteger('tendered_cents')->nullable();
            $t->unsignedBigInteger('change_cents')->nullable();
            $t->unsignedBigInteger('cash_refund_cents')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('documents', fn (Blueprint $t) => $t->dropColumn(['tendered_cents', 'change_cents', 'cash_refund_cents']));
    }
};
