<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', fn (Blueprint $t) => $t->string('name_ar', 150)->nullable());
        Schema::table('document_lines', fn (Blueprint $t) => $t->string('name_ar', 150)->nullable());
    }

    public function down(): void
    {
        Schema::table('products', fn (Blueprint $t) => $t->dropColumn('name_ar'));
        Schema::table('document_lines', fn (Blueprint $t) => $t->dropColumn('name_ar'));
    }
};
