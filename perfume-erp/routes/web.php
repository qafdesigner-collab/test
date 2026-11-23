<?php

use App\Http\Controllers\ArtworkPortalController as A;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CatalogueController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\ContactController;
use App\Http\Controllers\DesignProjectController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\InstallController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\ManufacturingController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ShiftController;
use App\Http\Controllers\SystemController;
use App\Http\Controllers\WorkspaceController;
use App\Http\Middleware\EnsureActiveUser;
use Illuminate\Support\Facades\Route;

Route::prefix('artwork-review/{token}')->where(['token' => '[a-f0-9]{64}'])->middleware('throttle:60,1')->group(function () {
    Route::get('/', [A::class, 'page']);
    Route::get('data', [A::class, 'data']);
    Route::get('files/{id}', [A::class, 'file'])->whereNumber('id');
    Route::post('upload', [A::class, 'upload'])->middleware('throttle:10,1');
    Route::post('decision', [A::class, 'decide'])->middleware('throttle:10,1');
});

Route::get('/media/logo', [CompanyController::class, 'logoImage'])->middleware('throttle:120,1');
Route::get('/install', [InstallController::class, 'show']);
Route::post('/install', [InstallController::class, 'install'])->middleware('throttle:10,1');

Route::middleware('guest')->group(function () {
    Route::view('/login', 'login')->name('login');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:20,1');
});
Route::middleware(['auth', EnsureActiveUser::class])->group(function () {
    Route::view('/', 'app');
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::prefix('api')->middleware('throttle:180,1')->group(function () {
        Route::get('staff', [WorkspaceController::class, 'staff']);
        Route::post('locations', [CompanyController::class, 'locations']);
        Route::post('users/{id}', [CompanyController::class, 'userAction'])->whereNumber('id');
        Route::get('bootstrap', [WorkspaceController::class, 'bootstrap']);
        Route::get('dashboard', [WorkspaceController::class, 'dashboard']);
        Route::get('products', [CatalogueController::class, 'products']);
        Route::post('products', [CatalogueController::class, 'saveProduct']);
        Route::post('products/{id}', [CatalogueController::class, 'saveProduct'])->whereNumber('id');
        Route::match(['get', 'post'], 'references', [CatalogueController::class, 'references']);
        Route::post('products/{id}/images', [CatalogueController::class, 'uploadImage'])->whereNumber('id');
        Route::post('images/{id}', [CatalogueController::class, 'imageAction'])->whereNumber('id');
        Route::match(['get', 'post'], 'contacts', [ContactController::class, 'contacts']);
        Route::post('contacts/{id}', [A::class, 'profile'])->whereNumber('id');
        Route::get('inventory', [InventoryController::class, 'inventory']);
        Route::post('stock', [InventoryController::class, 'stock']);
        Route::post('lots/expiry', [InventoryController::class, 'lotExpiry']);
        Route::match(['get', 'post'], 'stock-counts', [InventoryController::class, 'counts']);
        Route::get('documents', [DocumentController::class, 'documents']);
        Route::post('documents', [DocumentController::class, 'createDocument']);
        Route::get('documents/{id}', [DocumentController::class, 'document'])->whereNumber('id');
        Route::post('documents/{id}', [DocumentController::class, 'documentAction'])->whereNumber('id');
        Route::get('formulas', [ManufacturingController::class, 'formulas']);
        Route::post('formulas', [ManufacturingController::class, 'saveFormula']);
        Route::post('formulas/{id}/approve', [ManufacturingController::class, 'approveFormula'])->whereNumber('id');
        Route::match(['get', 'post'], 'batches', [ManufacturingController::class, 'batches']);
        Route::post('batches/{id}', [ManufacturingController::class, 'batchAction'])->whereNumber('id');
        Route::match(['get', 'post'], 'projects', [DesignProjectController::class, 'projects']);
        Route::post('projects/{id}', [DesignProjectController::class, 'projectAction'])->whereNumber('id');
        Route::match(['get', 'post'], 'projects/{id}/customer-link', [A::class, 'manage'])->whereNumber('id');
        Route::post('projects/{id}/artwork', [DesignProjectController::class, 'uploadArtwork'])->whereNumber('id');
        Route::get('artwork/{id}', [DesignProjectController::class, 'artwork'])->whereNumber('id');
        Route::match(['get', 'post'], 'shifts', [ShiftController::class, 'shifts']);
        Route::match(['get', 'post'], 'settings', [CompanyController::class, 'settings']);
        Route::post('settings/logo', [CompanyController::class, 'logo']);
        Route::match(['get', 'post'], 'users', [CompanyController::class, 'users']);
        Route::post('password', [AuthController::class, 'password']);
        Route::get('audit', [CompanyController::class, 'auditLog']);
        Route::get('customers/{id}/360', [ReportController::class, 'customerDossier'])->whereNumber('id');
        Route::get('products/{id}/360', [ReportController::class, 'productDossier'])->whereNumber('id');
        Route::post('projects/{id}/links', [DesignProjectController::class, 'projectLinks'])->whereNumber('id');
        Route::post('projects/{id}/workflow', [DesignProjectController::class, 'projectWorkflow'])->whereNumber('id');
        Route::get('profitability', [ReportController::class, 'profitability']);
        Route::get('export', [ReportController::class, 'export']);
        Route::get('system', [SystemController::class, 'status']);
        Route::post('system/update', [SystemController::class, 'update'])->middleware('throttle:system');
        Route::post('system/backup', [SystemController::class, 'backup'])->middleware('throttle:system');
    });
    Route::get('media/image/{id}', [CatalogueController::class, 'image'])->whereNumber('id');
});
