/* Atelier Perfume ERP · Reports and profitability. */
'use strict';

async function reportsPage() {
  const r = await api('profitability');
  const value = n => (n === null ? 'Not recorded' : money(n));
  $('#content').innerHTML =
    pageHead(
      'Purchases, sales & profit',
      'Follow each product from supplier bill or production batch to its sale.',
      `<a class="secondary" href="/api/export?type=stock">Stock CSV</a><a class="primary" href="/api/export?type=profit">Profit CSV</a>`,
    ) +
    `<div class="notice">Gross profit = sales after discounts, excluding tax − cost of goods sold. It excludes general business expenses. Stock is consumed in receipt order. Existing stock is valued from configured costs when tracking begins; historical invoices without cost snapshots remain uncosted.</div><div class="stats">${reportStat('Purchases excluding tax', money(r.purchase_cents), 'Supplier bills', '')}${reportStat('Sales excluding tax', money(r.revenue_cents), 'Active posted sales', '')}${reportStat('Cost of goods sold', value(r.cogs_cents), 'Stock cost captured on sale', '')}${reportStat('Gross profit', value(r.gross_profit_cents), 'Before general expenses', '')}</div><p class="muted">Inventory value: <b>${money(r.stock_value_cents)}</b> · ${r.estimated_cost_documents} invoices include estimated costs · ${r.missing_cost_documents} invoices have missing historical costs.</p>` +
    panel(
      'Product purchase and sales ledger',
      table(
        [
          'Product / unit',
          'Bought qty',
          'Purchase cost',
          'Sold qty',
          'Sales ex. tax',
          'Cost of goods sold',
          'Gross profit',
          'Remaining / value',
        ],
        r.products.map(
          p =>
            `<tr><td><b>${esc(p.name)}</b><small>${esc(p.sku)} · ${esc(p.unit)}</small></td><td>${quantity(p.purchased_milli)}</td><td>${money(p.purchase_cents)}</td><td>${quantity(p.sold_milli)}</td><td>${money(p.revenue_cents)}</td><td>${p.missing_cost_lines ? 'Not fully recorded' : money(p.cogs_cents)}</td><td>${p.missing_cost_lines ? 'Not fully recorded' : money(p.gross_profit_cents)}</td><td>${quantity(p.stock_milli)}<small>${money(p.stock_value_cents)}</small></td></tr>`,
        ),
      ),
    ) +
    panel(
      'Profit by sales invoice',
      table(
        ['Invoice', 'Sales ex. tax', 'Cost', 'Gross profit', 'Cost status'],
        r.invoices.map(
          i =>
            `<tr><td><button class="subtle" onclick="documentDetail(${i.id})">${esc(i.number)}</button></td><td>${money(i.revenue_cents)}</td><td>${value(i.cogs_cents)}</td><td>${value(i.gross_profit_cents)}</td><td>${i.cogs_cents === null ? 'Missing historical cost' : i.estimated ? 'Includes estimates' : 'Recorded stock cost'}</td></tr>`,
        ),
      ),
    );
}

function reportStat(label, value, help) {
  return `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-number">${esc(value)}</div><small>${esc(help)}</small></div>`;
}
