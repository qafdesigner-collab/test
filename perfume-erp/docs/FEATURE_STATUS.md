# Feature status — 0.3.0 development milestone

| Area | Implemented and exercised | Remaining for full specification |
|---|---|---|
| Identity | Session login, CSRF, throttling, roles, disabled accounts, passwords | MFA, fine-grained permissions and branch scoping |
| Company | Details, currency, tax identifier, stock locations, users | Logo/theme customization, branches, onboarding imports |
| Catalogue | Products/base units, classification, search, custom family tags, inspiration, sorting, multiple private images, top/heart/base note layers, scent description and performance profile | Parent/variant model, multiple reference links, saved filters, image reorder/import |
| Inventory | Lot/location balances, movement ledger, atomic adjustments/transfers, receipt-ordered lot values, sale cost snapshots and value-preserving returns | Reservations, quarantine locations, counts, expiry, in-transit dispatch/receive, reorder automation and accountant-reviewed historical valuation |
| Purchasing | Posted purchase receipts and payments | Purchase requisitions/orders, partial receipts, supplier returns, landed costs |
| Wholesale | Quotes, acceptance/decline, invoice reference/due dates, seller/customer snapshots, private COGS/gross profit, immediate-stock invoices, credit checks, payments, full returns | Quote conversion, sales orders, partial deliveries/returns, price lists, cartons/unit conversion, commissions |
| POS | Catalogue/barcode search, basket, stock validation, shifts, ingredient opt-in and fractional base-unit sales, single-method payments, receipts, cashier price restrictions | Hardware certification, direct print/drawer connector, split tender, tender/change, held baskets, partial refunds |
| Formula | Restricted recipes, immutable versions, per-bottle material/packaging quantities, manager release | Formula percentages, density conversions, alternatives, customer samples and measured consumption |
| Production | Planning, BOM issue, maturation, QC hold/recheck/release, accepted/rejected output, supplier-derived material cost, batch cost components, recorded stage events and durations | WIP ledger, partial bottling, rework, actual material overrides, regulatory QA attachments and recall interface |
| Design | Briefs, assignment, print specs, proof files/versions, manager approval evidence, revision reset, delivery lock, customer/product/batch/vendor links, packaging readiness and stage history | Customer portal, native source files, task/time tracking, outsourcing purchase orders |
| Reports | Customer/product 360 views and print, progress charts/timelines, product/invoice gross profit, purchases/sales/stock value exports, outstanding invoices, audit | Full accounting/financial statements, historical valuation, ageing, scheduled reports |
| Deployment | PHP/Laravel app, Windows/Linux setup/start scripts, local/online configuration instructions, SQLite backup command | Production hardening, signed updates, migration recovery acceptance and packaging as desktop installer |
| Licensing | Not enabled | Signed vendor entitlements, offline activation/grace, renewal and vendor management panel |
| Hybrid | Not enabled | Allocated-stock branch replication, outbox/inbox, replay/conflict controls and outage acceptance |
| UAE invoicing | Configurable tax calculation and printed documents only | Verify current official requirements and implement provider-connected structured electronic invoicing |
| Localization | English responsive interface | Arabic/RTL translation and acceptance |

Not commercial-ready; missing items are intentionally disclosed instead of simulated. Automated tests are relevant development evidence, not substitutes for business, legal, accounting, security or hardware acceptance.


## Customer artwork links (0.4)

Implemented: 30-day project-scoped customer links; close/recreate link controls; customer artwork uploads (PDF/JPG/PNG/WebP, 16 MB); studio mockup review; exact-version approval or revision requests with entered name, matching registered phone and consent; history and internal customer timeline; stored-profile WhatsApp destination with prepared message and link; copy, preview and print controls. WhatsApp sends only when the staff member sends the opened message in WhatsApp.

Phone entry is a self-declared approval record, without OTP verification. Keep links with their intended recipients. Public pages contain artwork and project status, excluding private formulas, production costs and vendor information. Phone changes revoke existing links. Guest uploads clear approval and supersede packaging readiness.

The Laravel deployment serves `/artwork-review/{token}` without staff login, while ERP APIs require staff login. Configure a customer-accessible HTTPS APP_URL and run migrations when updating an existing installation. A localhost or LAN installation produces links accessible only from that network. The hosted saved-data trial includes the same portal routes. Its ERP routes are restricted to the configured owner account; artwork links are designed for customer access without ERP login.
