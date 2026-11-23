<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('references', function (Blueprint $t) {
            $t->string('gender', 20)->nullable();
            $t->string('family', 80)->nullable();
            $t->string('segment', 20)->nullable();
            $t->boolean('library')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('references', function (Blueprint $t) {
            $t->dropColumn(['gender', 'family', 'segment', 'library']);
        });
    }
};
