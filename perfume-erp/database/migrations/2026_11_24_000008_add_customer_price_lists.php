<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contacts', fn (Blueprint $t) => $t->unsignedInteger('discount_bp')->default(0));
        Schema::create('customer_prices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $t->foreignId('product_id')->constrained();
            $t->unsignedBigInteger('price_cents');
            $t->timestamps();
            $t->unique(['contact_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_prices');
        Schema::table('contacts', fn (Blueprint $t) => $t->dropColumn('discount_bp'));
    }
};
