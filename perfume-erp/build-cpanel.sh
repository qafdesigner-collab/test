#!/usr/bin/env bash
# Build a cPanel upload package: dist/atelier-erp-cpanel-<version>.zip
#
#   perfume-erp/   application code (upload next to public_html, NOT inside it)
#   public_html/   web files; copy its contents into your domain's public_html
#
# Requires PHP 8.3, Composer and zip on the build machine. The server needs no SSH.
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(sed -n "s/.*'version' => '\([^']*\)'.*/\1/p" config/erp.php)
OUT=dist/build
rm -rf "$OUT" && mkdir -p "$OUT/perfume-erp" "$OUT/public_html"

tar cf - \
  --exclude=./dist --exclude=./vendor --exclude=./node_modules --exclude=./tests --exclude=./.git \
  --exclude=./.env --exclude='./database/*.sqlite' --exclude=./docs/previews \
  --exclude='./storage/logs/*.log' --exclude='./storage/framework/sessions/*' \
  --exclude='./storage/framework/views/*.php' --exclude='./storage/framework/cache/data/*' \
  --exclude='./storage/app/private/*' --exclude='./bootstrap/cache/*.php' \
  --exclude='./storage/app/*.zip' --exclude='./storage/app/backups/*' --exclude=./storage/framework/testing \
  --exclude=./.phpunit.result.cache --exclude=./.phpunit.cache . | (cd "$OUT/perfume-erp" && tar xf -)

# Reuse the local vendor folder (run composer install first) and strip development-only packages.
[ -f vendor/autoload.php ] || { echo 'Run composer install first.'; exit 1; }
cp -a vendor "$OUT/perfume-erp/vendor"
(cd "$OUT/perfume-erp" && COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction --no-scripts --quiet \
  && find vendor -name .git -type d -prune -exec rm -rf {} + \
  && rm -f bootstrap/cache/packages.php bootstrap/cache/services.php)

# Web root for the "public_html" layout: same files as public/, with paths pointing to ../perfume-erp
cp -a "$OUT/perfume-erp/public/." "$OUT/public_html/"
cat > "$OUT/public_html/index.php" <<'PHP'
<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Folder that holds the application, next to public_html. Change it if you renamed the folder.
$appBase = __DIR__.'/../perfume-erp';

if (file_exists($maintenance = $appBase.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

require $appBase.'/bootstrap/first-run.php';
require $appBase.'/vendor/autoload.php';

/** @var Application $app */
$app = require_once $appBase.'/bootstrap/app.php';
$app->usePublicPath(__DIR__);

$app->handleRequest(Request::capture());
PHP

# The application folder itself must never be served. Sub-folders inherit this file, so it must not
# simply deny everything: that would also block perfume-erp/public, the recommended document root.
# If a domain's document root points at perfume-erp by mistake, every request is passed on to
# public/ (so .env, storage and the code stay unreachable); without mod_rewrite nothing is served.
cat > "$OUT/perfume-erp/.htaccess" <<'HTACCESS'
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^(.*)$ public/$1 [L]
</IfModule>
<IfModule !mod_rewrite.c>
    <IfModule mod_authz_core.c>
        Require all denied
    </IfModule>
    <IfModule !mod_authz_core.c>
        Deny from all
    </IfModule>
</IfModule>
HTACCESS
cp docs/CPANEL_INSTALL.md "$OUT/README-CPANEL.md"

for d in "$OUT/perfume-erp/storage/app/private" "$OUT/perfume-erp/storage/framework/sessions" "$OUT/perfume-erp/storage/framework/views" "$OUT/perfume-erp/storage/framework/cache/data" "$OUT/perfume-erp/storage/logs"; do mkdir -p "$d"; done

ZIP="dist/atelier-erp-cpanel-${VERSION}.zip"
rm -f "$ZIP"
(cd "$OUT" && zip -qr -X "../$(basename "$ZIP")" .)
echo "Created $ZIP"
