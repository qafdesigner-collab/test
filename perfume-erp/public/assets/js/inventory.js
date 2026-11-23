/* Atelier Perfume ERP · Inventory balances, movements, adjustments and transfers. */
'use strict';

async function inventoryPage() {
  await loadLists();
  const d = await api('inventory');
  $('#content').innerHTML =
    pageHead(
      'Inventory, with a paper trail.',
      'Lot balances and every movement, across your locations.',
      can('manager', 'warehouse')
        ? '<button class="primary" onclick="stockDialog()">+ Adjust / transfer stock</button>'
        : '',
    ) +
    `<div class="notice">Opening stock, adjustments and transfers require a reason. Purchase receipts, production and sales update this ledger automatically.</div>` +
    panel(
      'Stock by location and lot',
      table(
        ['Product', 'Location', 'Lot', 'Available quantity'],
        d.balances.map(
          b =>
            `<tr><td><strong>${esc(b.name)}</strong><small>${esc(b.sku)}</small></td><td>${esc(b.location)}</td><td>${esc(b.lot)}</td><td>${quantity(b.quantity_milli)} ${esc(b.unit)}</td></tr>`,
        ),
      ),
    ) +
    panel(
      'Recent movement history',
      table(
        ['Date', 'Product', 'Location / lot', 'Change', 'Reason / source'],
        d.movements.map(
          m =>
            `<tr><td>${date(m.created_at)}</td><td>${esc(m.name)}</td><td>${esc(m.location)}<small>${esc(m.lot)}</small></td><td><span class="badge ${m.quantity_milli > 0 ? 'green' : 'red'}">${m.quantity_milli > 0 ? '+' : ''}${quantity(m.quantity_milli)} ${esc(m.unit)}</span></td><td>${esc(m.reason)}<small>${esc(m.source)}</small></td></tr>`,
        ),
      ),
      '<a class="subtle" href="/api/export?type=stock">Export CSV ↓</a>',
    );
}

function stockDialog() {
  modal(
    'Adjust or transfer inventory',
    `<form><div class="form-grid"><label class="span2">Product<select name="product_id" required>${options(state.products.filter(p => p.active && p.kind !== 'service'))}</select></label><label>Source / working location<select name="location_id">${options(state.boot.locations, 'name', state.location)}</select></label><label>Transfer destination (optional)<select name="target_id">${options(state.boot.locations, 'name', '', 'Adjustment only')}</select></label>${field('Lot code (must match for deduction)', 'lot', 'GENERAL')}${field('Quantity · negative for adjustment deduction', 'quantity', '1')}<label class="span2">Reason<textarea name="reason" placeholder="Opening balance, count correction or transfer reason" required></textarea></label></div><p class="form-hint">Quantities are in the product's base stock unit. Transfers require a positive quantity and move the same lot.</p>${formActions('Post stock movement')}</form>`,
  );
  bindForm(async (fd, key) => {
    const v = Object.fromEntries(fd);
    v.target_id = v.target_id ? Number(v.target_id) : null;
    await api('stock', 'POST', v, key);
    closeModal();
    toast('Stock ledger updated');
    await inventoryPage();
  });
}
