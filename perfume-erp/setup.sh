#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v php >/dev/null || { echo 'Install PHP 8.3+ first.'; exit 1; }
if [ ! -f vendor/autoload.php ]; then composer install --no-interaction; fi
if [ ! -f .env ]; then cp .env.example .env; php artisan key:generate; fi
if [ ! -f database/database.sqlite ]; then touch database/database.sqlite; fi
php artisan migrate --force
php artisan erp:install
printf '\nRun bash start-local.sh to open the local application.\n'
