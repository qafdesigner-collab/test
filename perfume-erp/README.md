# Atelier Perfume ERP — development release 0.4.0

A working Laravel 13 / PHP 8.3 application for a perfume company, with a responsive browser interface and a separate database per installation. No shared demonstration password is shipped.

**Release status: development milestone, not the final commercial product.** See [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md) for the exact implemented scope and remaining work. Do not substitute this build for an accepted accounting or regulatory submission system.

## Start locally (Windows)

1. Install PHP 8.3 or newer compatible PHP and Composer. Enable PDO/SQLite, mbstring, XML/DOM, fileinfo, GD and ZIP extensions. Keep security updates current.
2. Extract this folder to a writable location, such as `C:\PerfumeERP`.
3. Open a terminal in this folder and run `setup.bat`. Choose your own owner name, email and password (minimum 12 characters).
4. Run `start-local.bat`, then open `http://127.0.0.1:8080` in a browser.
5. Sign in and edit Company & access. Create locations, contacts, materials, products and other users.

Linux/macOS: `bash setup.sh`, then `bash start-local.sh`. The packaged vendor dependencies make first use possible without downloading PHP packages if you already have the required runtime. Composer remains necessary for upgrades/development. If vendor dependencies are absent, run `composer install` before setup.

## Fictional demonstration data

A fresh installation is empty. To explore the catalogue with six fictional fragrances and sample materials, use `php artisan erp:install --demo` **instead of** the normal installer owner step, on a freshly migrated database with no users. Alternatively, after normal setup and before creating any products, run:

```sh
php artisan db:seed --class=Database\\Seeders\\PerfumeSeeder
```

On Windows PowerShell, pass the class as `'Database\Seeders\PerfumeSeeder'`. The seeder refuses to run over an existing product catalogue. Demo records, reference names and placeholder bottle art are fictional. There is no third-party brand photography. Upload your own product photos using Catalogue → product → Manage images.

## Core workflows

- **Products:** add finished perfumes/materials/packaging/services, scent families and notes, style, actual origin, audience, concentration, internal inspiration reference, SKU/barcode, base units and prices. Use custom comma-separated families/tags. Add photos, choose a cover or remove a photo.
- **Inventory:** opening balances and adjustments require a reason. Transfers move a particular lot between locations. Quantities use the defined base unit; conversion between cartons/bottles or mass/volume is not implemented.
- **Purchases:** post a purchase receipt; goods immediately enter the selected location. This is not a separate purchase-order/partial-receipt workflow.
- **Wholesale:** draft quotations do not move stock or accept payment. Managers can accept/decline them. Posted invoices immediately deduct stock; credit is checked against the customer's configured limit. Record payments separately. Full sale returns can restock or record a non-restocked return; actual card/bank refunds must be processed externally.
- **POS:** open a cashier shift, select products or search a barcode, fill the basket and post a sale. Closing a shift compares counted cash against its opening float and recorded cash receipts/refunds. Cashiers cannot override prices or discounts. This version records one payment method per sale; split tenders and terminal connections are pending.
- **Manufacturing:** create a formula using quantities per finished bottle in each material's base unit. A manager approves the immutable version. Plan a batch, issue materials/packaging, start maturation, record QC, and complete with actual accepted/rejected bottle counts. Accepted units become batch-tracked stock. Material consumption uses planned BOM quantities; operator-measured consumption overrides and rework are pending.
- **Design:** create a brief, assign a team member, record printing/packaging specifications and upload proof versions (PDF/images). Managers record approval evidence or revision instructions. New uploads clear the active approval. Delivery requires an approved file. Customer self-service approval is pending.

## Data and privacy

Private uploads: `storage/app/private`. SQLite data: `database/database.sqlite`. Credentials/environment: `.env`. Never serve the project root; only `public/` is a web document root. API permissions apply server-side. Inspiration references are internal staff information and never a public claim of affiliation.

Each company needs its own application directory, database, storage and APP_KEY. There is no multi-company selector or vendor licence server in this release. Duplicate the deployment safely and initialize each independently.

## Online and local installation

The included start scripts bind to localhost for review/development. A local office server can bind to an approved LAN interface; restrict firewall access and use a proper web server/TLS for multi-user service. This works while the server/LAN is available without an internet connection. It does **not** synchronize disconnected branches.

For an online deployment: use PHP-FPM with Nginx/Apache, point the document root to `public/`, configure a separate database and private storage, set `APP_ENV=production`, `APP_DEBUG=false`, your real `APP_URL`, secure cookies under HTTPS, and proper backup/monitoring. SQLite is the tested database. Other configured Laravel database drivers have not been acceptance-tested with these workflows. PHP's built-in server is not the production hosting plan.

## Tests and recovery

```sh
php artisan test --compact
vendor/bin/pint --format agent
php artisan erp:backup /secure/backups/erp-2026-10-05.zip
```

The backup command creates a consistent SQLite snapshot plus private assets. It refuses an existing destination and public-directory paths. **The ZIP is unencrypted and contains confidential data**; protect it with OS permissions and your encrypted backup system. Keep `.env`/APP_KEY separately and securely; it is not included. Restore only during maintenance, preserve the original files, restore the database and private directory together, and verify before allowing users back. A production recovery drill is still a release gate.

## Before a final commercial ZIP

Complete all applicable pending items in the feature matrix, run hardware and branch-concurrency checks, validate accounting/tax requirements and provider integrations, run a real-company pilot, and conduct installation/update/restore acceptance. The source specification is included as `docs/Complete_Development_Prompt.md`.

## Ingredient sales and batch costs

Catalogue → Edit product → Sell individually = Yes. Set the selling price per base stock unit. Fractional quantities (up to 3 decimal places) are supported for ml, litres, grams and kg; counted items require whole quantities. Sales and production use the same stock ledger.

Production → Plan batch: enter estimated labour, overhead, freight and other costs for the whole batch. Issuing materials freezes configured unit costs and recipe quantities. Complete the batch with recorded additional costs and accepted/rejected output. Open the batch for cost components, cost per accepted unit, estimate variance and indicative margin. Formula details show estimated materials per bottle. These are operational costs, not lot-based inventory valuation.

Existing installations: back up first, update application files and run `php artisan migrate --force`. This adds sale eligibility and nullable batch cost sheets without replacing existing data.

## Customer/product 360 and invoicing costs

Customer 360 shows products first, linked design/packaging jobs, artwork versions, vendors, production batches, progress charts, timelines and invoices. Create a customer, then link their project to the product, batch and supplier in Design & Packaging. Existing projects support Link customer / product / vendor. Record vendor start/finish, packaging readiness and delivery with notes; optional completion dates preserve recorded event time separately. New artwork supersedes packaging readiness until approved again. Delivery requires packaging ready and any linked batch completed.

Open a product for top, heart and base notes, scent description, intensity, lasting time, projection, season and occasion. Use Full product history for versioned formulas, packaging files, batches, costs, elapsed durations and purchase history. Customer and product 360 print actions produce confidential internal reports. The complete customer print appends all linked product records.

Supplier bill prices after line discounts (excluding tax) become purchased lot values. Production consumes receipt-ordered lots and carries their costs plus batch extras into the finished lot. Sales capture consumed cost allocations and gross profit on each invoice, independent of later price changes. Transfers and restocked full returns preserve stock value. Old stock starts with configured estimated costs; old invoices without cost snapshots remain uncosted. Gross profit excludes general business expenses; this is operational costing, not a complete accounting implementation.

Invoice reference, due date, company/contact snapshots and customer print are separate from private cost/margin panels. Managers/owners can open the complete 360 records. Formula confidentiality is enforced on the server.
