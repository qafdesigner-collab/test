<?php

use App\Http\Controllers\ArtworkPortalController as A;
use App\Http\Controllers\ErpController as E;
use App\Http\Controllers\InstallController;
use App\Http\Middleware\EnsureActiveUser;
use Illuminate\Support\Facades\Route;

Route::prefix('artwork-review/{token}')->where(['token' => '[a-f0-9]{64}'])->middleware('throttle:60,1')->group(function () {
    Route::get('/', [A::class, 'page']);
    Route::get('data', [A::class, 'data']);
    Route::get('files/{id}', [A::class, 'file'])->whereNumber('id');
    Route::post('upload', [A::class, 'upload'])->middleware('throttle:10,1');
    Route::post('decision', [A::class, 'decide'])->middleware('throttle:10,1');
});

Route::get('/install', [InstallController::class, 'show']);
Route::post('/install', [InstallController::class, 'install'])->middleware('throttle:10,1');

Route::middleware('guest')->group(function () {
    Route::view('/login', 'login')->name('login');
    Route::post('/login', [E::class, 'login'])->middleware('throttle:20,1');
});
Route::middleware(['auth', EnsureActiveUser::class])->group(function () {
    Route::view('/', 'app');
    Route::post('/logout', [E::class, 'logout']);
    Route::prefix('api')->middleware('throttle:180,1')->group(function () {
        Route::get('staff', [E::class, 'staff']);
        Route::post('locations', [E::class, 'locations']);
        Route::post('users/{id}', [E::class, 'userAction'])->whereNumber('id');
        Route::get('bootstrap', [E::class, 'bootstrap']);
        Route::get('dashboard', [E::class, 'dashboard']);
        Route::get('products', [E::class, 'products']);
        Route::post('products', [E::class, 'saveProduct']);
        Route::post('products/{id}', [E::class, 'saveProduct'])->whereNumber('id');
        Route::match(['get', 'post'], 'references', [E::class, 'references']);
        Route::post('products/{id}/images', [E::class, 'uploadImage'])->whereNumber('id');
        Route::post('images/{id}', [E::class, 'imageAction'])->whereNumber('id');
        Route::match(['get', 'post'], 'contacts', [E::class, 'contacts']);
        Route::post('contacts/{id}', [A::class, 'profile'])->whereNumber('id');
        Route::get('inventory', [E::class, 'inventory']);
        Route::post('stock', [E::class, 'stock']);
        Route::get('documents', [E::class, 'documents']);
        Route::post('documents', [E::class, 'createDocument']);
        Route::get('documents/{id}', [E::class, 'document'])->whereNumber('id');
        Route::post('documents/{id}', [E::class, 'documentAction'])->whereNumber('id');
        Route::get('formulas', [E::class, 'formulas']);
        Route::post('formulas', [E::class, 'saveFormula']);
        Route::post('formulas/{id}/approve', [E::class, 'approveFormula'])->whereNumber('id');
        Route::match(['get', 'post'], 'batches', [E::class, 'batches']);
        Route::post('batches/{id}', [E::class, 'batchAction'])->whereNumber('id');
        Route::match(['get', 'post'], 'projects', [E::class, 'projects']);
        Route::post('projects/{id}', [E::class, 'projectAction'])->whereNumber('id');
        Route::match(['get', 'post'], 'projects/{id}/customer-link', [A::class, 'manage'])->whereNumber('id');
        Route::post('projects/{id}/artwork', [E::class, 'uploadArtwork'])->whereNumber('id');
        Route::get('artwork/{id}', [E::class, 'artwork'])->whereNumber('id');
        Route::match(['get', 'post'], 'shifts', [E::class, 'shifts']);
        Route::match(['get', 'post'], 'settings', [E::class, 'settings']);
        Route::match(['get', 'post'], 'users', [E::class, 'users']);
        Route::post('password', [E::class, 'password']);
        Route::get('audit', [E::class, 'auditLog']);
        Route::get('customers/{id}/360', [E::class, 'customerDossier'])->whereNumber('id');
        Route::get('products/{id}/360', [E::class, 'productDossier'])->whereNumber('id');
        Route::post('projects/{id}/links', [E::class, 'projectLinks'])->whereNumber('id');
        Route::post('projects/{id}/workflow', [E::class, 'projectWorkflow'])->whereNumber('id');
        Route::get('profitability', [E::class, 'profitability']);
        Route::get('export', [E::class, 'export']);
    });
    Route::get('media/image/{id}', [E::class, 'image'])->whereNumber('id');
});
