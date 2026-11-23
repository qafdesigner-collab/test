<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->string('role')->default('cashier');
            $t->boolean('active')->default(true);
        });
        Schema::create('settings', function (Blueprint $t) {
            $t->string('key')->primary();
            $t->text('value');
        });
        Schema::create('locations', function (Blueprint $t) {
            $t->id();
            $t->string('name')->unique();
            $t->string('kind')->default('warehouse');
            $t->timestamps();
        });
        Schema::create('references', function (Blueprint $t) {
            $t->id();
            $t->string('brand');
            $t->string('name');
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['brand', 'name']);
        });
        Schema::create('products', function (Blueprint $t) {
            $t->id();
            $t->string('sku')->unique();
            $t->string('name');
            $t->string('kind');
            $t->string('unit');
            $t->string('barcode')->nullable()->unique();
            $t->unsignedBigInteger('price_cents')->default(0);
            $t->unsignedBigInteger('cost_cents')->default(0);
            $t->unsignedInteger('tax_bp')->default(0);
            $t->unsignedBigInteger('reorder_milli')->default(0);
            $t->json('families');
            $t->json('notes');
            $t->json('tags');
            $t->string('style')->nullable();
            $t->string('origin')->nullable();
            $t->string('audience')->nullable();
            $t->string('concentration')->nullable();
            $t->string('size')->nullable();
            $t->text('description')->nullable();
            $t->foreignId('reference_id')->nullable()->constrained('references');
            $t->boolean('active')->default(true);
            $t->timestamps();
        });
        Schema::create('images', function (Blueprint $t) {
            $t->id();
            $t->foreignId('product_id')->constrained()->cascadeOnDelete();
            $t->string('path');
            $t->string('thumb');
            $t->string('alt');
            $t->integer('position')->default(0);
            $t->timestamps();
        });
        Schema::create('contacts', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('kind');
            $t->string('email')->nullable();
            $t->string('phone')->nullable();
            $t->text('address')->nullable();
            $t->string('tax_id')->nullable();
            $t->unsignedBigInteger('credit_cents')->default(0);
            $t->unsignedInteger('terms_days')->default(0);
            $t->timestamps();
        });
        Schema::create('balances', function (Blueprint $t) {
            $t->id();
            $t->foreignId('product_id')->constrained();
            $t->foreignId('location_id')->constrained();
            $t->string('lot')->default('GENERAL');
            $t->bigInteger('quantity_milli')->default(0);
            $t->unique(['product_id', 'location_id', 'lot']);
        });
        Schema::create('movements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('product_id')->constrained();
            $t->foreignId('location_id')->constrained();
            $t->string('lot');
            $t->bigInteger('quantity_milli');
            $t->string('reason');
            $t->string('source');
            $t->foreignId('user_id')->nullable()->constrained();
            $t->timestamp('created_at');
            $t->index(['product_id', 'location_id']);
        });
        Schema::create('documents', function (Blueprint $t) {
            $t->id();
            $t->uuid('uuid')->unique();
            $t->string('number')->nullable()->unique();
            $t->string('kind');
            $t->string('status')->default('Draft');
            $t->foreignId('contact_id')->nullable()->constrained();
            $t->foreignId('location_id')->constrained();
            $t->foreignId('user_id')->constrained();
            $t->unsignedBigInteger('subtotal_cents');
            $t->unsignedBigInteger('tax_cents');
            $t->unsignedBigInteger('total_cents');
            $t->unsignedBigInteger('paid_cents')->default(0);
            $t->string('method')->default('Credit');
            $t->text('notes')->nullable();
            $t->unsignedBigInteger('original_id')->nullable();
            $t->timestamps();
        });
        Schema::create('document_lines', function (Blueprint $t) {
            $t->id();
            $t->foreignId('document_id')->constrained()->cascadeOnDelete();
            $t->foreignId('product_id')->constrained();
            $t->string('name');
            $t->string('unit');
            $t->unsignedBigInteger('quantity_milli');
            $t->unsignedBigInteger('price_cents');
            $t->unsignedBigInteger('discount_cents')->default(0);
            $t->unsignedInteger('tax_bp');
            $t->unsignedBigInteger('subtotal_cents');
            $t->unsignedBigInteger('tax_cents');
            $t->unsignedBigInteger('total_cents');
        });
        Schema::create('payments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('document_id')->constrained();
            $t->unsignedBigInteger('amount_cents');
            $t->string('method');
            $t->foreignId('user_id')->constrained();
            $t->timestamps();
        });
        Schema::create('idempotency', function (Blueprint $t) {
            $t->string('key')->primary();
            $t->foreignId('user_id')->constrained();
            $t->string('action');
            $t->string('fingerprint');
            $t->json('result');
            $t->timestamp('created_at');
        });
        Schema::create('formulas', function (Blueprint $t) {
            $t->id();
            $t->string('code');
            $t->unsignedInteger('version');
            $t->foreignId('product_id')->constrained();
            $t->string('name');
            $t->json('ingredients');
            $t->json('packaging');
            $t->text('instructions')->nullable();
            $t->unsignedInteger('maturation_days')->default(0);
            $t->string('status')->default('Draft');
            $t->foreignId('user_id')->constrained();
            $t->timestamps();
            $t->unique(['code', 'version']);
        });
        Schema::create('batches', function (Blueprint $t) {
            $t->id();
            $t->string('number')->nullable()->unique();
            $t->foreignId('formula_id')->constrained();
            $t->foreignId('location_id')->constrained();
            $t->unsignedInteger('planned');
            $t->unsignedInteger('accepted')->default(0);
            $t->unsignedInteger('rejected')->default(0);
            $t->string('status')->default('Planned');
            $t->json('issued')->nullable();
            $t->text('qc_notes')->nullable();
            $t->text('loss_reason')->nullable();
            $t->unsignedBigInteger('material_cost_cents')->default(0);
            $t->unsignedBigInteger('extra_cost_cents')->default(0);
            $t->timestamp('matures_at')->nullable();
            $t->foreignId('user_id')->constrained();
            $t->timestamps();
        });
        Schema::create('projects', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->foreignId('contact_id')->nullable()->constrained();
            $t->string('type');
            $t->text('brief');
            $t->date('due_date')->nullable();
            $t->foreignId('assigned_id')->nullable()->constrained('users');
            $t->string('status')->default('Brief');
            $t->unsignedBigInteger('charge_cents')->default(0);
            $t->unsignedBigInteger('cost_cents')->default(0);
            $t->text('specification')->nullable();
            $t->unsignedBigInteger('approved_artwork_id')->nullable();
            $t->foreignId('user_id')->constrained();
            $t->timestamps();
        });
        Schema::create('artworks', function (Blueprint $t) {
            $t->id();
            $t->foreignId('project_id')->constrained()->cascadeOnDelete();
            $t->unsignedInteger('version');
            $t->string('path');
            $t->string('filename');
            $t->string('mime');
            $t->text('comment')->nullable();
            $t->foreignId('user_id')->constrained();
            $t->timestamps();
            $t->unique(['project_id', 'version']);
        });
        Schema::create('approvals', function (Blueprint $t) {
            $t->id();
            $t->foreignId('project_id')->constrained();
            $t->foreignId('artwork_id')->constrained();
            $t->foreignId('user_id')->constrained();
            $t->string('decision');
            $t->text('comment');
            $t->timestamp('created_at');
        });
        Schema::create('shifts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained();
            $t->unsignedBigInteger('opening_cents');
            $t->unsignedBigInteger('counted_cents')->nullable();
            $t->bigInteger('variance_cents')->nullable();
            $t->timestamp('opened_at');
            $t->timestamp('closed_at')->nullable();
        });
        Schema::create('audit', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained();
            $t->string('action');
            $t->string('subject');
            $t->json('details')->nullable();
            $t->timestamp('created_at');
        });
    }

    public function down(): void
    {
        foreach (['audit', 'shifts', 'approvals', 'artworks', 'projects', 'batches', 'formulas', 'idempotency', 'payments', 'document_lines', 'documents', 'movements', 'balances', 'contacts', 'images', 'products', 'references', 'locations', 'settings'] as $table) {
            Schema::dropIfExists($table);
        }Schema::table('users', function (Blueprint $t) {
            $t->dropColumn(['role', 'active']);
        });
    }
};
