# Feature status — 0.9.1

English is the main language; Arabic is the second language (right-to-left).

| Area | Implemented and tested | Not included yet |
|---|---|---|
| Installation | cPanel package (no SSH), web installer with server check and install code, MySQL/MariaDB or SQLite, in-app update from an uploaded package (with automatic backup first), one-click database update, backups (download + daily cron, MySQL dump restorable in phpMyAdmin) | Signed automatic updates, desktop installer |
| Identity | Session sign-in, CSRF, throttling, roles (owner, manager, accountant, warehouse, production, cashier, designer), disabled accounts, password confirmation for sensitive actions, two-step sign-in with authenticator app codes and one-time recovery codes for owner and managers (owner reset, emergency command) | Fine-grained permissions, branch scoping |
| Company | Details, currency, TRN and VAT registration, Arabic name/address, logo, sign-in page photo, brand colour, invoice footer, stock locations, users, stock issue order (FIFO/FEFO) | Multiple companies in one installation |
| Language | English ⇄ Arabic switch for the whole interface, sign-in page, installer and server messages; bilingual printed documents | Arabic-Indic digits, translation of user-entered data |
| Catalogue | Products and units, scent families and note layers, fragrance profile, images, Arabic product names, EAN-13 barcode generation, printable product and shelf labels (A4 sheets and label printers), internal inspiration library (546 designer, niche and Middle Eastern references with top / heart / base note pyramids, search and filters, your own photo per reference and a web-search link) with Excel/CSV import and export | Product variants, image re-ordering |
| Inventory | Lot/location balances and ledger, adjustments, transfers, lot expiry dates and warnings, physical stock counts with stale-count protection, FIFO or FEFO issue (expired lots blocked under FEFO), reorder suggestions per supplier with one-click draft purchase orders | Reservations, quarantine locations, in-transit transfers |
| Purchasing | Purchase orders with partial deliveries and close/cancel, direct purchase receipts, supplier payments, returns to suppliers with payable reduction or refund | Landed costs, purchase requisitions |
| Sales | Quotations, one-click conversion to invoice, credit limits, payments capped at the balance, full and partial returns with refunds only of over-payment, customer price lists (fixed prices or discount %) applied on quotations, invoices and POS, loyalty points earned on sales and redeemed as payment | Sales orders, partial deliveries, commissions |
| POS | Barcode/product search, basket, held baskets, split payments (cash/card/bank), cash change, shifts with expected cash (sales, refunds, drawer expenses), end-of-day Z report (80 mm and A4), 80 mm receipts with loyalty balance | Card terminal and cash drawer connection |
| UAE tax documents | Bilingual tax invoice / simplified tax invoice / tax credit note: seller and customer TRN, VAT per line, VAT summary, totals in AED | Provider-connected structured e-invoicing (verify current FTA rules with your accountant) |
| Manufacturing | Approved formula versions, batches with material issue, maturation, QC, accepted/rejected output, batch costing | Rework, measured consumption overrides |
| Design | Briefs, artwork versions, approvals, customer review links (WhatsApp), packaging workflow stages | Native design files, time tracking |
| Finance | Expenses by category (void with reason), monthly profit & loss with chart and CSV, receivables ageing, bilingual customer statements, product profitability, CSV exports | Full double-entry accounting, balance sheet, bank reconciliation |
| Reports & UI | Dashboard with sales charts, best sellers, low stock and expiry; Customer/Product 360; sortable, filterable, paged tables; six themes (Light, Dark, Auto and the premium Obsidian, Maison and Oud) with printing always in light; responsive desktop/tablet/phone | Scheduled email reports |
| Not enabled | Hybrid branch synchronisation, licence server | — |

Automated tests: 94 feature tests (SQLite) and the same business suites on MySQL/MariaDB 10.11. Tests are development evidence; do a pilot with real data and check tax and accounting requirements with your accountant before relying on the system for filing.
