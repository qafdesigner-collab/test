<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lot_details', function (Blueprint $t) {
            $t->id();
            $t->foreignId('product_id')->constrained();
            $t->string('lot');
            $t->date('expires_on')->nullable();
            $t->timestamps();
            $t->unique(['product_id', 'lot']);
            $t->index('expires_on');
        });
        Schema::create('stock_counts', function (Blueprint $t) {
            $t->id();
            $t->string('number')->nullable()->unique();
            $t->foreignId('location_id')->constrained();
            $t->foreignId('user_id')->constrained();
            $t->text('notes')->nullable();
            $t->unsignedInteger('lines_counted')->default(0);
            $t->unsignedInteger('adjustments')->default(0);
            $t->bigInteger('value_change_cents')->default(0);
            $t->timestamp('created_at');
        });
        Schema::create('stock_count_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stock_count_id')->constrained()->cascadeOnDelete();
            $t->foreignId('product_id')->constrained();
            $t->string('lot');
            $t->bigInteger('expected_milli');
            $t->bigInteger('counted_milli');
            $t->bigInteger('difference_milli');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_count_lines');
        Schema::dropIfExists('stock_counts');
        Schema::dropIfExists('lot_details');
    }
};
