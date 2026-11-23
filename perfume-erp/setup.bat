@echo off
cd /d "%~dp0"
where php >nul 2>nul
if errorlevel 1 (echo Install PHP 8.3+ and add it to PATH first. & pause & exit /b 1)
if not exist vendor\autoload.php (call composer install --no-interaction)
if errorlevel 1 exit /b 1
if not exist .env (
 copy .env.example .env >nul
 php artisan key:generate
 if errorlevel 1 exit /b 1
)
if not exist database\database.sqlite type nul > database\database.sqlite
php artisan migrate --force
if errorlevel 1 exit /b 1
php artisan erp:install
if errorlevel 1 exit /b 1
echo Run start-local.bat, then open http://127.0.0.1:8080
pause
