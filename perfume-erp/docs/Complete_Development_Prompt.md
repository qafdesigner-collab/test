# Complete Development Prompt: Perfume Business ERP & POS

Version: 1.0 | Prepared: 5 October 2026 | Language: English

## How to use this file

Give this entire file to your development team or coding assistant. It is a product specification and implementation prompt, not finished application code. Implement in the ordered stages below. Keep later-stage requirements in the architecture even when they are not delivered in the first release. Record assumptions and unresolved external integrations; never claim an unfinished feature works.

## 1. Mission and operating model

Act as an experienced product architect, ERP engineer, inventory/accounting specialist, and UI designer. Build a commercially sellable perfume-business ERP with retail POS, wholesale, manufacturing, design, printing, and packaging. The product serves multiple independent companies, each with a separate installation, database, storage, branding, and users. Maintain one shared, versioned codebase with configurable modules; do not fork the application per customer.

Support online server installation, local office server installation, and hybrid branch operation. Local users connect to a dedicated server through their LAN, using browsers on Windows computers and compatible tablets. Internet must not be required for ordinary local operations. A powered-off local server or failed LAN is a separate outage. Hybrid offline synchronization is an explicit development stage, not an automatic consequence of a responsive website or PWA.

Target company types: perfume manufacturer, fragrance-oil wholesaler, finished-perfume wholesaler, retail perfume shop, private-label producer, and design/printing/packaging business. A company may operate several of these together. Permit modules to be enabled independently, with clearly defined dependencies.

The vendor control panel manages licences, customer installation identities, entitlements, renewals, and releases. It must not routinely receive customer sales, formulas, artwork, or other business data. Support access requires explicit customer authorization and audit logging.

## 2. Engineering approach

Use a modular Laravel backend with a responsive component-based frontend; propose a maintained frontend stack and justify it before implementation. Confirm compatible, supported Laravel/PHP versions from official documentation when starting. Do not assume a remembered framework/runtime pairing is valid. Use a relational database, background jobs, private file storage, and automated migrations. Choose the database and local deployment method once, document the decision, and apply them consistently.

Prefer a modular monolith initially, with boundaries for identity, catalogue, purchasing, inventory, manufacturing, sales, POS, creative jobs, accounting, licensing, and sync. Avoid premature microservices. Core business rules must live in reusable server-side services, not only in interface handlers.

Use transactions, decimal quantities and money, configurable currency precision, explicit rounding policies, immutable posted records, and UUIDs for distributed identities. Never use floating-point arithmetic for financial totals. Keep timestamps in UTC with company timezones for display and business dates. Prevent repeated requests from creating repeated postings through idempotency keys and database constraints.

Store secrets in environment/configuration secret stores. Do not commit credentials. Provide an API with permission enforcement, pagination, documented contracts, rate limits, and integration credentials. Do not build unrequested integrations as fake working buttons.

## 3. Beautiful, practical interface

Create a premium perfume-business interface that looks polished and is fast to operate. Use generous spacing, elegant readable typography, consistent icons, restrained shadows, rounded cards, and a calm colour palette. Suggested starting palette: ivory/light grey backgrounds, deep navy or burgundy primary colour, and subtle muted accent colours. Customer branding can override suitable theme tokens. Keep stock warnings and workflow statuses visually distinct without relying on colour alone.

Use a clear sidebar, contextual page toolbar, breadcrumbs where helpful, global search, notifications, user menu, and visible branch/warehouse selector. Persist useful preferences such as catalogue view and filters. Use attractive product image cards for browsing and dense tables for operational work. Provide light mode first and an optional accessible dark mode later. Avoid heavy decorative animation, low-contrast glass effects, and excessive gradients in daily work screens.

Support desktop, wide displays, tablets, and mobile layouts. POS must be touch friendly. All controls require visible focus states, accessible labels, keyboard support, sufficient contrast, and clear validation. Support English and Arabic with RTL layouts. Translation strings must be separate from business logic.

Every screen needs loading, empty, success, error, permission-denied, and offline/stale-data states where relevant. Errors must explain the action the user can take. Preserve entered form values after validation failures. Provide confirmation for consequential posting actions and explain the stock/accounting effect. Customers should never see raw stack traces.

## 4. Company setup and roles

Manage company legal details, trading name, logo, addresses, contacts, tax identifiers, currency, timezone, languages, branches, shops, warehouses, production locations, invoice numbering, payment methods, and templates. Onboarding includes opening balances, opening inventory, users, and licence activation. Define a branch as an operational subdivision, not automatically a separate legal entity.

Roles include Company Owner, Administrator, Branch Manager, Accountant, Purchasing Officer, Warehouse Officer, Production Manager, Mixing Operator, Quality Controller, Salesperson, Cashier, Designer, and Customer Portal User. Use granular permissions plus branch/warehouse scope. Enforce permissions in APIs and exports as well as screens.

Separate rights for viewing formulas, formula export, viewing cost, modifying selling prices, approving discounts, credit overrides, stock adjustments, refunds, and accounting posting. Restrict who can change approval rules. Disable public employee signup; invite staff. Customer registration is optional and controlled by the company.

## 5. Product catalogue and fragrance finder

Manage raw ingredients, packaging, bulk/intermediate blends, finished goods, testers, sample kits, gift sets, purchased resale products, and services. Products have internal code, SKU, name, Arabic name where needed, description, brand, status, category, supplier references, barcodes, tax treatment, default units, prices, cost policy, and images. Archive used products rather than deleting transaction history.

Model a parent perfume with sellable variants such as 30 ml, 50 ml, 100 ml, concentration, or packaging edition. Variant stock and barcode remain separate. Bulk oil and bottled perfume have distinct inventory identities linked by production/BOM, not by informal quantity adjustments.

Create editable classifications, supporting multiple values where appropriate:

| Classification | Examples / rule |
|---|---|
| Scent family | Fresh, Citrus, Floral, Woody, Amber/Oriental, Fruity, Aquatic, Gourmand, Aromatic, Leather |
| Scent descriptors | Sweet, spicy, smoky, powdery, green, musky, light |
| Style | French style, Arabian style, fusion; independent from country of manufacture |
| Actual origin | Recorded country of manufacture/origin with supporting data where relevant |
| Audience | Men, women, unisex; editable labels |
| Concentration/type | Parfum, EDP, EDT, cologne, attar, perfume oil; configurable |
| Notes | Structured top, middle, base notes; shared note dictionary |
| Occasion | Daily, office, evening, special occasion |
| Season | Summer, winter, all season; optional |
| Inspiration | One or more reference brands/perfumes, relationship type, internal notes |
| Other tags | Company-defined labels, price bands, collection, best seller |

Keep inspiration references in a separate reference-fragrance directory. Search by the company's product name, code, barcode, reference brand/perfume, fragrance note, and tag. A reference need not be a stock item. Support multiple internal products linked to a reference fragrance and multiple references per product.

Provide combined filtering, multi-select facets, sorting, saved filters, grid/list views, availability by location, and quick product detail. Example query: Fresh + Aquatic + Unisex + 100 ml + In Stock. Sort by name, price, newest, and actual sales volume within a selected period. Do not confuse scent family, style, origin, or concentration.

Offer rule-based similar-product suggestions based on shared scent families, notes, and tags. Explain which traits matched; do not display an invented scientific similarity percentage. Filter suggested alternatives to products the user is allowed to see. Any later AI assistance must be optional, reviewed, and unnecessary for local core operations.

Default inspiration references to internal visibility. Configure whether they appear in POS, staff quotations, public catalogue, or customer portal. Keep customer-facing brand-reference wording separately editable and subject to company review. Do not automatically copy third-party logos, product photos, or imply affiliation.

## 6. Product images and uploaded assets

Implement actual image uploading, not a placeholder field. Allow several images per product, a primary image, display ordering, replacement, deletion with permission, alt text, and optional variant-specific images. Support drag-and-drop, file chooser, preview, and optional crop. Preserve the original and generate suitable thumbnails/optimized display versions. Do not alter product appearance through automatic AI processing.

Show images in catalogue cards, POS tiles, product details, quotations/catalogues when configured, and the customer portal. Use tasteful placeholders if there is no image. Bulk upload/import should match files by SKU and report unmatched items. Avoid loading full-resolution images in lists.

Validate actual file content, permitted raster formats, size, dimensions, and upload limits on the server. Sanitize filenames, strip unnecessary metadata from display derivatives, use unpredictable storage keys, and block executable content. Design source files/PDFs use a separate controlled attachment route with download authorization and malware-scanning capability. Confidential artwork must not become publicly accessible merely because product photos are public.

Local installations store and serve images locally. Hybrid mode includes thumbnail caching and explicit attachment transfer status; transactions must not fail solely because a large artwork attachment is still transferring. Uploaded assets must be included in backup and restoration.

## 7. Units and conversions

Support ml/litre, gram/kg, piece, bottle, box, carton, and company-defined compatible units. Store a base inventory unit per SKU and validated conversion factors. A carton factor belongs to its packaging/variant; do not assume all cartons have the same bottle count. Preserve the conversion used on historical documents.

Separate weight, volume, and count dimensions. Convert weight to volume only using a documented ingredient density and relevant measurement conditions. Never assume 1 gram = 1 ml. Formula measurement basis must be explicit: mass, volume, or another supported calculation basis. Document precision, scaling, and rounding rules and reconcile any residual quantities.

## 8. Formulas, samples, and cost

Create confidential formulas with code, version, ingredients, quantity/percentage, measurement basis, target yield, production instructions, maturation period, quality criteria, and approval. Validate totals according to basis. Separate fragrance blend formula from finished dilution formula and packaging BOM where appropriate. Allow alternatives only through controlled approval; preserve actual ingredients used.

Scale formulas to batch targets, check material availability, estimate cost, and reserve stock. Include ingredient, bottle, cap, pump, label, carton, labour, overhead, outsourced services, and wastage in defined cost policies. Show expected versus actual cost and margin with permission. Do not change historical costs when supplier prices change.

Maintain sample requests and sample versions, customer feedback, sample dispatch, and approval history. Link approved samples and formula versions to private-label orders. Sample material consumption and free testers must be accounted for, not silently deducted. Lock released formula versions; revisions create new versions. Log access/export events for confidential formulas.

## 9. Manufacturing and quality

Workflow: production request -> approval -> material reservation/issue -> mixing -> maturation -> QC -> bottling -> packaging -> completion. Track planned and actual quantities, material lots, intermediate output, dates, operator, equipment/tank where used, and destination warehouse. Support partial completion and unconsumed material returns.

Statuses: Draft, Approved, Materials Issued, Mixing, Maturing, QC Hold, Released, Bottling, Packaging, Completed, Cancelled. Define permitted transitions and authorized actors. Failed QC stock is quarantined and unavailable for sale. Rework uses a linked order with material and cost history. Completed production cannot be casually edited; corrections require linked reversals/adjustments.

Record waste, evaporation, spillage, rejects, and recovered material separately. Add only accepted actual output to saleable stock. For 1,000 planned bottles and 980 accepted bottles, add 980, record the 20-unit discrepancy with its actual cause, and reconcile materials and costs. Do not assume this loss distribution without recorded measurements.

Trace material supplier lots to mixing batches, filling/packaging batches, and customer deliveries. Provide forward/backward traceability and a recall report. Quality checks may include appearance, odour, fill volume, leakage, and company-defined laboratory checks. The software records evidence and approvals; it must not claim it can certify chemical safety from a formula automatically. Support certificates and technical documents as attachments.

## 10. Inventory and purchasing

Maintain a stock movement ledger with product, location, lot, quantity, unit, source document, time, actor, and reason. Distinguish physical, reserved, available, quarantine, and in-transit stock. Use locking/atomic updates for simultaneous sales. Default to preventing negative stock, with tightly controlled and logged exceptions only if expressly configured.

Support requisitions, supplier quotations, purchase orders, partial receipts, inspections, supplier invoices, purchase returns, and landed costs. Supplier invoice receipt alone must not duplicate a goods receipt. Support transfers with dispatch and receiving steps, count sessions, approved adjustments, reorder points, expiry alerts, and lot-aware picking.

Select and document inventory valuation policy, including treatment of production, returns, and landed costs. Posting must be consistent between stock valuation and accounting. Require opening stock quantities and valuation, not just arbitrary totals.

## 11. Wholesale sales and CRM

Manage leads, customers, addresses, contacts, tax details, salespeople, price lists, credit limits, payment terms, and statements. Workflow: quotation -> approval -> sales order -> reservation -> delivery -> invoice -> payment, with configurable invoice timing. Keep these events distinct.

Support bottle/box/carton pricing, quantity tiers, minimum orders, customer-specific prices, deposits, partial deliveries, backorders, discount approval, shipping charges, and repeat orders. Preserve accepted prices and unit conversion on documents. Include line images optionally. Design/printing service charges may be separate or included as explicit lines.

Credit checks must consider relevant unpaid exposure according to a documented policy. Overrides require permission and a reason. Customer returns link to original transactions, determine stock condition, and generate appropriate financial correction. Commissions follow a defined rule, including returns and unpaid sales, not just an arbitrary invoice percentage.

## 12. POS

Build a fast touch-friendly screen with product images, scanner input, search by inspiration and scent, filters, cart, quantity, permitted discounts, totals, customer selection, hold/resume, cash/card/split payments, receipts, and returns. Enforce price/cost permissions. Display offline status and stale availability clearly.

Support opening/closing shifts, float, cash in/out with reasons, expected cash, counted cash, variances, and supervisor approval. Test selected scanner, receipt printer, and drawer models. Browser printing is a baseline; silent/direct printing needs an explicit supported local connector. Record card payments separately from terminal integration; implement provider integration only with real credentials/specifications and handle uncertain payment results safely.

No duplicate sale on double-click, repeated retry, payment callback, or reconnect. Returns require original sale lookup, eligible quantities, authorization, and restock/quarantine decision. Offline returns may be limited to locally available verified transactions. Display restrictions clearly.

## 13. Design, printing, and packaging jobs

Manage design briefs, tasks, assigned designers, deadlines, milestones, revisions, customer comments, internal comments, time entries, approval, and charges. Support logos, perfume labels, bottle designs, boxes, general graphics, and printing work. The ERP stores and routes artwork; it does not replace professional design tools.

Store file versions, previews, source files, approval timestamps, approver identity, and the approved immutable version. Keep customer-visible comments distinct from internal notes. A revised approved file requires a new approval when configured. Production/printing references the specific approved version, not a mutable latest-file link.

Printing jobs capture dimensions and units, material, colour specification, sides, quantity, finishing, artwork requirements, proof approval, internal/external production, and supplier costs. Support customer-supplied packaging/material ownership without misclassifying it as company-owned stock. Estimate versus actual job cost and margin. Provide checklists and downloadable artwork guidelines per job/product type.

## 14. Private-label workflow and portal

Connect customer brief, fragrance reference, sample development, formula approval, artwork approval, quotation, deposit, manufacturing, outsourced printing, packaging, delivery, and final payment. Configure required approvals and block release until satisfied. Capture customer-specific exclusivity/ownership notes with restricted visibility; do not invent legal conclusions.

Optional portal: customers see only their own orders, approved catalogue, authorized prices, quotations, artwork proofs, approvals, invoices, balances, and reorder requests. Never reveal formula ingredients or other customers' jobs. Invitations, expiring signed approval links, and authenticated access must follow the company's policy. No generic error on guest checkout: show a clear sign-in/register requirement where registration is enabled.

## 15. Accounts and UAE readiness

Implement receivables, payables, deposits, receipts, payments, expenses, credit notes, cash/bank ledgers, reconciliation, and a chart of accounts. Full accounting requires balanced double-entry posting for sales, tax, purchasing, inventory, production/WIP, cost of goods sold, and corrections. Configure posting mappings and accounting periods. Treat unimplemented statements as unavailable, not fabricated reports.

Provide tax configuration, inclusive/exclusive calculations, approved rounding policy, invoice identifiers, company/customer tax details, credit-note links, and configurable invoice/receipt templates. Review tax treatment and financial mappings with a qualified accountant before production acceptance.

Create a separate UAE e-invoicing integration adapter and implementation backlog. Before claiming compliance, verify current official requirements, applicability, required structured fields, approved provider connectivity, acknowledgement handling, outages, retention, and correction rules. PDF invoices alone must not be labelled a completed regulatory integration. Local/offline invoice behavior must be designed around the verified rules. No regulatory dates or unverified compliance claims are prescribed by this prompt.

## 16. Reports and dashboard

Build role-specific dashboards with date/branch filters, accurate drill-downs, and readable charts. Include sales, gross margin, overdue receivables, payables, low stock, pending approvals, production progress, maturation due, QC holds, design deadlines, and sync failures. Hide cost/margin widgets from unauthorized users.

Reports: stock ledger/valuation, lot traceability, expiry, transfer status, formula cost, expected/actual yield, wastage, production costs, wholesale sales, POS shifts, returns, customer/supplier statements, ageing, product/branch/salesperson performance, fragrance-family sales, design/printing job margin, and licensed module usage. Show report definitions and last refresh time. Export permitted data to CSV/XLSX/PDF through controlled services.

## 17. Local, online, and hybrid implementation

Online: secured web deployment, workers, scheduled jobs, private assets, backups, monitoring, HTTPS, and company-specific installation boundaries. Local: reproducible installer/setup, services starting on reboot, LAN access, controlled firewall configuration, local asset serving, logs, health checks, backup scheduling, and recovery documentation. Do not claim mobile devices can access a local server outside its network without configured remote connectivity.

Hybrid: define central authority for product masters, prices, permissions, and approved formulas; define branch-owned transactions and allocated stock. Initially support local branch POS, shifts, and related stock movements. Specify allowed offline operations, including limits on credit, returns, and master edits. Local credit information can be stale; use a controlled offline allowance or block such credit sales.

Use transactional outbox/inbox, UUIDs, sequence tracking, idempotent consumers, acknowledgement, retry/backoff, tombstones where appropriate, and a human-readable conflict queue. Posted monetary/stock records must never use generic last-write-wins. Use branch-specific invoice sequences whose legal suitability is verified. Keep device identity separate from document numbering.

Show pending/synced/failed/conflict counts, last successful sync, stale stock warning, and safe retry controls. Sync transactions separately from heavy files. Do not promise real-time stock across disconnected branches. Document recovery after replacement hardware, partial transfers, clock errors, interrupted sync, and replay.

## 18. Licences, updates, and data protection

Vendor panel: customer contact/company, installation IDs, licence type, enabled modules, seats/branches if limited, expiry, offline grace, support entitlement, release channel, and activation history. Use signed entitlements verified locally; provide offline activation via challenge/response where needed. No customer-sensitive payload is necessary for routine licence checks.

Use least privilege, strong password handling, optional MFA, login throttling, private download authorization, upload validation, and audit logs. Logs must not leak formulas, passwords, tokens, or confidential attachments. Document limits of IP protection when software is installed on customer-controlled hardware; do not promise unbreakable source protection.

Define expiry behavior explicitly. Preserve access to existing records and exports; do not destroy data or abruptly terminate an active cashier shift because a licence check fails. Publish grace and renewal rules in the product configuration and contract.

Updates: signed release artifacts, compatibility checks, database backup, asset migration, maintenance window, migration logs, and recovery/rollback procedures. Database rollback may require a restore; do not imply reverting code alone reverses data migrations. Stage rollouts and let local customers schedule updates. Disabled modules must preserve existing data and define access/export behavior.

Back up database, assets, configuration needed for recovery, and securely managed encryption keys. Provide separate backup copies, retention settings, encryption, integrity checks, and restore drills. A sync replica is not a backup. Recovery must include formulas, artwork versions, product images, stock history, and accounting.

## 19. Minimum data domains

Design normalized entities for company/branch/location, users/roles, products/variants, units/conversions, prices, categories/tags, fragrance families/notes/reference perfumes, product-reference links, media/attachments, suppliers/customers, formulas/versions/ingredients, BOMs, lots, samples/approvals, production orders/issues/outputs/QC, stock movements/reservations/counts/transfers, purchase documents, sales documents/deliveries/returns, payments/refunds, shifts/cash movements, creative projects/tasks/artwork versions/approvals, printing jobs, ledger accounts/journals, licences, audit events, and sync outbox/inbox/conflicts.

Define document identities, legal entity scope, posting boundaries, foreign keys, uniqueness, indexing, and archive policies. Keep draft editing separate from posted correction. Uploaded file versions and approved formula versions require durable references. Final schema must be documented and reviewed against the workflows before implementation.

## 20. Screens to deliver

Login/onboarding; dashboard; catalogue image grid and table; perfume detail; classifications/reference directory; image manager; formula editor/version detail; sample request; production planning and batch detail; maturation/QC board; inventory/lot traceability; purchase order/receipt; customer and supplier detail; quotation/order/delivery/invoice; POS and shift closing; returns; creative projects/artwork approval; printing job; private-label order overview; accounts/reports; company/users/permissions; backups/health; local sync monitor; and separate vendor licence/release panel.

Implement real navigation, persistence, validation, and permissions. No dead buttons, fake totals, or hardcoded production dashboards. Mark optional unimplemented integrations clearly, without presenting them as available.

## 21. Development stages and completion gates

1. Discovery and design: inspect repository if any, document workflows, resolve implementation-critical unknowns, choose supported stack, create schema and screen prototypes. Validate with a manufacturer and wholesaler. Do not turn every minor choice into a blocking question.
2. Foundation and wholesale: company, users, catalogue/classification/images, units, purchasing, stock ledger, quotations/orders/delivery, basic invoices/payments. Gate: purchase -> receive -> sell -> deliver -> return reconciles quantities and balances.
3. Manufacturing: formulas, BOM, samples, lots, mixing, maturation, QC, packaging, actual costing. Gate: an approved production batch reconciles materials, WIP, waste, accepted output, and costs.
4. POS: counter workflow, receipts, shifts, permissions, returns, supported hardware. Gate: repeated/concurrent requests cannot duplicate sales/payments or improperly consume stock.
5. Design/private label: projects, source files, revisions, customer approval, printing/outsourcing, connected order workflow. Gate: only the approved formula/artwork versions enter release.
6. Commercial installation: online/local setup, licences, backups, release/update process, support documentation, imports, and pilot rollout. Gate: clean installs, update, and restore work on representative hardware.
7. Hybrid: offline POS and branch syncing first, then explicitly scoped additional offline modules. Gate: repeated/failed/out-of-order transfers preserve consistent transactions without silent conflicts.
8. Advanced integrations/accounting: complete scoped financial reports, verified UAE e-invoicing/provider integration, and agreed external services. Sequence accounting foundations earlier where required for correct stock/financial posting.

This is the full product scope. Deliver the stages incrementally; do not present a prototype as the finished ERP. Provide an estimate after repository, team, hardware, and external integration discovery rather than inventing a completion date.

## 22. Meaningful tests and acceptance examples

- Upload three images, choose a cover, reorder them, assign a variant image, and verify correct thumbnails in POS/catalogue and original preservation.
- Search an inspiration name and retrieve linked internal perfumes. Combine fresh, aquatic, unisex, size, and stock filters. Verify internal-only references are absent from public output.
- Convert 2 cartons of 12 bottles to 24 bottles; retain the historical carton factor after catalogue edits. Reject invalid weight/volume conversion without density.
- Produce 980 accepted bottles against a 1,000-bottle target; reconcile measured material use, waste, WIP, and cost without phantom stock.
- Reject unauthorized formula API reads and exports, even through guessed IDs. Verify branch-scoped access.
- Process partial purchases, partial deliveries, deposits, returns, refunds, and discounts; verify no duplicated stock movements and balanced journals where enabled.
- Submit the last available unit simultaneously from two cashiers; enforce the configured stock policy atomically.
- Retry a payment/sale request and callback; create one payment and one sale posting.
- Block production when required sample/artwork approval is missing; retain approvals against immutable versions after revision.
- Disconnect a hybrid branch, sell allocated stock, reconnect, and replay the queue; no duplicate invoices/payments/stock. Test partial sync and clock skew.
- Restore a backup to a clean installation including uploaded images and confidential artwork. Apply an update and exercise recovery after a deliberately failed migration in a test environment.
- Check English/Arabic layouts, touch use, keyboard navigation, responsive screens, error handling, and supported POS hardware.

Use targeted unit tests for costing/conversion/posting rules, integration tests for workflows/permissions/concurrency, and end-to-end tests for critical operator journeys. Use fictional demo data only. Test accounts, stock, formulas, and reference names must be clearly marked; no copied third-party assets.

## 23. Final developer deliverables

Deliver source code, migrations, seed/demo data, deployment packages, environment example, API contracts, architecture and schema notes, administrator/user guides, data import templates, hardware support list, backup/restore/update runbooks, test commands/results, and a release checklist. Include a feature-status matrix: implemented, verified, partial, pending, and dependent on external provider.

Demonstrate one complete fictional company: raw-material purchase -> formula -> sample/design approval -> batch production -> bottle/packaging stock -> wholesale/POS sale -> payment/return -> accurate reports. Demonstrate both online and local installation separately. Demonstrate hybrid only once its stage passes failure/replay testing.

First inspect the available project and instructions, then produce the implementation plan, schema, and UI direction. Build the first stage with working vertical workflows. Continue through agreed stages, report material blockers candidly, and never label the entire system complete solely because screens render.

## 24. Suggested demo experience

Use a fictional perfume called Ocean Breeze, with Fresh/Citrus/Aquatic families, French style, UAE manufacture, unisex audience, 50 ml/100 ml variants, an internal fictional inspiration reference, uploaded images, approved formula, and packaging artwork. Provide additional woody, floral, and gourmand examples to exercise filters. Show a clean catalogue with image cards, scent badges, stock/price visibility by role, and a quick-add POS action. Keep the premium visual design consistent across operational screens.

The end result must be attractive enough to sell, simple enough for shop and warehouse staff, and reliable enough to reconcile actual materials, stock, money, approvals, and offline transactions.
