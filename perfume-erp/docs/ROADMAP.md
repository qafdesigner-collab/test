# Roadmap to completion (English + Arabic)

Language order: English first (default), Arabic second.

Working rule: one step at a time; each step ends with tests (SQLite, plus MySQL where data
changes), browser screenshots, a rebuilt cPanel ZIP, a commit and a push to
`claude/hopeful-ptolemy-xrt7sw`. Tick the box in the same commit.

## Done before this list
- [x] cPanel installer, MySQL, backups, one-click update
- [x] Code split into module controllers and frontend modules
- [x] Dashboard charts, branding, printing, table tools, dark mode
- [x] POS split payments / change / held baskets, quotation → invoice
- [x] Partial customer returns, purchase orders, supplier returns
- [x] Lot expiry, stock counts, inspiration library + CSV import
- [x] Arabic interface with right-to-left layout

## Remaining
- [x] 1. Remove Urdu (English + Arabic only); Arabic for server messages, sign-in page and installer
- [x] 2. UAE tax invoice: bilingual English/Arabic A4 invoice and receipt, TRN, "Tax Invoice" title, VAT summary
- [x] 3. Expenses: record rent, salaries, utilities etc. by category, date, method and note
- [x] 4. Profit & loss: monthly revenue − cost of goods − expenses = net profit, with chart and export
- [x] 5. Receivables: customer statement (print/PDF) and ageing (current, 30, 60, 90+ days)
- [x] 6. FEFO option: sell the earliest-expiring lots first
- [x] 7. Final pass: full regression on SQLite and MySQL, every page in English and Arabic (desktop + mobile), cPanel install from the ZIP, updated guide and feature status

## Phase 2 (0.7.0)
- [x] 8. Barcode and price labels: print product labels (name, price, barcode, Arabic name) and shelf labels on A4 sheets or label printers; generate barcodes for products without one
- [x] 9. Wholesale price lists: customer-specific prices or a discount % per customer, applied automatically on quotations and invoices
- [ ] 10. Reorder suggestions: products at or below reorder level, suggested quantities per supplier, one click to draft a purchase order
- [ ] 11. POS end-of-day (Z) report: sales by payment method, refunds, drawer expenses, expected vs counted cash, printable 80 mm and A4
- [ ] 12. Customer loyalty: points earned on POS and invoice sales, redeemed as a discount, balance on receipts and Customer 360
- [ ] 13. Two-step sign-in (authenticator app codes) for owner and managers, with recovery codes
- [ ] 14. Final pass for 0.7.0: tests on SQLite and MySQL, every page in English and Arabic, fresh cPanel install, docs
