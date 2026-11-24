<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('references', function (Blueprint $t) {
            $t->string('top_notes', 500)->nullable();
            $t->string('heart_notes', 500)->nullable();
            $t->string('base_notes', 500)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('references', fn (Blueprint $t) => $t->dropColumn(['top_notes', 'heart_notes', 'base_notes']));
    }
};
