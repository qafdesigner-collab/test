<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $t) {
            $t->foreignId('product_id')->nullable()->constrained();
            $t->foreignId('batch_id')->nullable()->constrained('batches');
            $t->foreignId('supplier_id')->nullable()->constrained('contacts');
            $t->json('workflow_events')->nullable();
        });
        Schema::table('batches', fn (Blueprint $t) => $t->json('workflow_events')->nullable());
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $t) {
            $t->dropConstrainedForeignId('product_id');
            $t->dropConstrainedForeignId('batch_id');
            $t->dropConstrainedForeignId('supplier_id');
            $t->dropColumn('workflow_events');
        });
        Schema::table('batches', fn (Blueprint $t) => $t->dropColumn('workflow_events'));
    }
};
