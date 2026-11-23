<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $t) {
            $t->id();
            $t->string('number')->nullable()->unique();
            $t->date('spent_on')->index();
            $t->string('category', 80)->index();
            $t->string('description', 300);
            $t->unsignedBigInteger('amount_cents');
            $t->unsignedBigInteger('tax_cents')->default(0);
            $t->string('method', 20);
            $t->boolean('from_drawer')->default(false);
            $t->foreignId('contact_id')->nullable()->constrained();
            $t->string('reference', 100)->nullable();
            $t->foreignId('user_id')->constrained();
            $t->timestamp('voided_at')->nullable();
            $t->string('void_reason', 300)->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
