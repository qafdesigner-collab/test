<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('artwork_links', function (Blueprint $t) {
            $t->id();
            $t->foreignId('project_id')->constrained()->cascadeOnDelete();
            $t->foreignId('contact_id')->constrained();
            $t->foreignId('created_by')->constrained('users');
            $t->string('token_hash', 64)->unique();
            $t->text('encrypted_token');
            $t->boolean('allow_upload')->default(true);
            $t->timestamp('expires_at');
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
        });
        foreach (['artworks', 'approvals'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->unsignedBigInteger('user_id')->nullable()->change();
                $t->string('source')->default('staff');
                $t->string('customer_name')->nullable();
                $t->string('customer_phone', 20)->nullable();
                $t->unsignedBigInteger('artwork_link_id')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (['artworks', 'approvals'] as $table) {
            Schema::table($table, fn (Blueprint $t) => $t->dropColumn(['source', 'customer_name', 'customer_phone', 'artwork_link_id']));
        }
        Schema::dropIfExists('artwork_links');
    }
};
