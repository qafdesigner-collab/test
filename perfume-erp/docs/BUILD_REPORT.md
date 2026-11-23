# Build verification — 5 October 2026

Development release 0.1.0; this is a source/software checkpoint, not final commercial acceptance.

## Completed checks

- Laravel 13.34.0 installed on PHP 8.3.6; dependency versions locked in composer.lock.
- SQLite migrations completed.
- PHPUnit: 21 tests passed, 86 assertions. ERP-specific tests cover access restrictions, inspiration filters, decimal arithmetic, duplicate requests, failed-stock rollback, credit limits, count units, quotations, purchases/transfers, full returns, POS shifts/prices, formula approval, production/QC/maturation, images, artwork revision, disabled accounts, location management and overpayment prevention.
- Browser smoke tests: dashboard plus all 10 module routes rendered; no JavaScript page errors recorded.
- Browser product image upload persisted and displayed through authenticated media delivery.
- Desktop 1440 px, tablet 768 px and mobile 390 px catalogue layouts checked; no horizontal document overflow in the tested layouts; mobile navigation exercised.
- Screenshots inspected for desktop dashboard/catalogue and mobile catalogue. Placeholder graphics are fictional.
- SQLite backup snapshot extracted, integrity_check returned ok, and catalogue records were present. This checks the database backup artifact, not a full production recovery drill.
- PHP source formatted with Laravel Pint; JavaScript syntax checked.

## Acceptance still pending

See FEATURE_STATUS.md. No production server deployment, cross-branch synchronization, licensing infrastructure, payment-terminal/printer certification, financial statement validation or UAE e-invoicing certification was performed. The current build is unsuitable to label as the completed full specification.

## 0.2.0 ingredient sales and production costing

23 Laravel tests / 95 assertions passed. Trial workflow and API suites passed, including fractional ingredient sales, shared stock, opt-in sales permission, estimate preservation and issue-cost snapshots. UI includes sale eligibility, editable POS quantity, cost components and accepted-output costing. Material values use configured costs at issue; quantities use the approved recipe. Lot valuation and measured consumption remain deferred.

Desktop/mobile cost and sale-setting UI checks passed with no JavaScript errors.

## 0.3.0 invoice costing, fragrance profiles and 360 records

28 Laravel tests / 143 assertions passed. Trial workflow and API suites passed. Tests verify supplier cost → production output → sales COGS/gross profit, stable invoice/contact snapshots, return stock-value reconciliation, note-layer validation, customer/product/vendor links, workflow guards and artwork revision invalidation. Desktop/mobile customer and product 360 checks passed; printable internal records and private cost exclusion from customer invoice print were checked. The online trial preserves saved customer records and was published successfully. Full commercial acceptance remains pending.


## Tablet update — 0.3.1

The sidebar becomes a drawer at widths up to 1180 px. The navigation list scrolls independently so every tab remains reachable in landscape. Selecting a tab (including the current tab), tapping the backdrop, the close button or Escape closes the drawer. Keyboard focus is contained in the open drawer and returns to the menu button on dismissal. Layout grids and table scroll areas fit tablet widths; invoice editor fields remain available on smaller screens.


## Artwork portal validation — 0.4

34 Laravel tests / 203 assertions passed. Hosted workflow, API and portal tests passed. Touch navigation checked at 768×1024, 820×1180, 1024×768, 1180×820 and 390×844, with desktop regression at 1440×900. All 12 tabs were reachable without document overflow. Drawer dismissal, same-tab selection and rotation passed. Customer mobile approval, subsequent upload, staff version history and WhatsApp destination were checked in-browser at 390×844, 820×1180 and 1024×768, without JavaScript errors.
