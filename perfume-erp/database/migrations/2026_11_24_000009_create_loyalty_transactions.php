<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_transactions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $t->foreignId('document_id')->nullable()->constrained();
            $t->integer('points');
            $t->string('reason', 20);
            $t->foreignId('user_id')->nullable()->constrained();
            $t->timestamp('created_at');
            $t->index(['contact_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_transactions');
    }
};
