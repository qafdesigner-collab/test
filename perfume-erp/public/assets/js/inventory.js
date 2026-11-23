/* Atelier Perfume ERP · Inventory balances, movements, adjustments and transfers. */
'use strict';

async function inventoryPage() {
  await loadLists();
  const d = await api('inventory');
  const counts = can('manager', 'warehouse') ? (await api('stock-counts')).counts : [];
  state.inventory = d;
  $('#content').innerHTML =
    pageHead(
      'Inventory, with a paper trail.',
      'Lot balances and every movement, across your locations.',
      can('manager', 'warehouse')
        ? '<button class="secondary" onclick="stockCountDialog()">Stock count</button><button class="primary" onclick="stockDialog()">+ Adjust / transfer stock</button>'
        : '',
    ) +
    `<div class="notice">Opening stock, adjustments and transfers require a reason. Purchase receipts, production and sales update this ledger automatically.</div>` +
    panel(
      'Stock by location and lot',
      table(
        ['Product', 'Location', 'Lot', 'Available quantity', 'Expiry'],
        d.balances.map(
          b =>
            `<tr><td><strong>${esc(b.name)}</strong><small>${esc(b.sku)}</small></td><td>${esc(b.location)}</td><td>${esc(b.lot)}</td><td>${quantity(b.quantity_milli)} ${esc(b.unit)}</td><td>${expiryBadge(b.expires_on)}${can('manager', 'warehouse') && Number(b.quantity_milli) > 0 ? ` <button class="subtle" onclick="expiryDialog(${b.product_id}, '${esc(b.lot)}', '${b.expires_on || ''}')">${b.expires_on ? 'Change' : 'Set'}</button>` : ''}</td></tr>`,
        ),
      ),
    ) +
    (counts.length
      ? panel(
          'Stock counts',
          table(
            ['Count', 'Location', 'Counted by', 'Lines', 'Adjusted', 'Value change', 'Date'],
            counts.map(
              c =>
                `<tr><td><b>${esc(c.number)}</b>${c.notes ? `<small>${esc(c.notes)}</small>` : ''}</td><td>${esc(c.location)}</td><td>${esc(c.user)}</td><td>${c.lines_counted}</td><td>${c.adjustments}</td><td>${c.value_change_cents ? (c.value_change_cents > 0 ? '+' : '−') + money(Math.abs(c.value_change_cents)) : '—'}</td><td>${date(c.created_at)}</td></tr>`,
            ),
          ),
        )
      : '') +
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


/** Expiry date with a status: expired, within 60 days, or fine. */
function expiryBadge(expiresOn) {
  if (!expiresOn) return '<span class="muted">—</span>';
  const days = Math.floor((new Date(expiresOn + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000);
  const label = new Date(expiresOn + 'T00:00:00').toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' });
  if (days < 0) return `<span class="status-pill critical">Expired</span> <small>${label}</small>`;
  if (days <= 60) return `<span class="status-pill warning">${days} day${days === 1 ? '' : 's'}</span> <small>${label}</small>`;
  return `<span>${label}</span>`;
}

function expiryDialog(productId, lot, current) {
  modal(
    'Lot expiry date',
    `<form><p class="muted">Lot <b>${esc(lot)}</b>. The date applies to this lot in every location.</p><label>Expires on<input type="date" name="expires_on" value="${esc(current)}"></label><p class="form-hint">Leave empty to clear the date.</p>${formActions('Save date')}</form>`,
  );
  bindForm(async fd => {
    await api('lots/expiry', 'POST', { product_id: productId, lot, expires_on: fd.get('expires_on') || null });
    closeModal();
    toast('Expiry date saved');
    await inventoryPage();
  });
}

/** Physical stock count for one location. Blank lines are not counted; the draft is kept in this browser. */
function stockCountDialog(locationId = state.location) {
  const draftKey = 'atelier-count-' + locationId;
  let draft = {};
  try {
    draft = JSON.parse(localStorage.getItem(draftKey) || '{}');
  } catch {}
  const lots = state.inventory.balances.filter(b => b.location_id === locationId && Number(b.quantity_milli) !== 0);
  modal(
    'Stock count',
    `<form><div class="form-grid"><label>Location<select id="count-location">${options(state.boot.locations, 'name', locationId)}</select></label>${field('Note · for example "Month-end count"', 'notes', draft.notes || '')}</div>
    <div class="notice">Count what is physically on the shelf and type it in. Leave a line blank to skip it. Your entries are kept in this browser until you post. If stock moves while you count, you will be asked to recount those lines.</div>
    ${table(
      ['Product', 'Lot', 'System shows', 'Counted', 'Difference'],
      lots.map(b => {
        const key = b.product_id + '|' + b.lot;
        return `<tr><td><b>${esc(b.name)}</b><small>${esc(b.sku)}</small></td><td>${esc(b.lot)}</td><td>${quantity(b.quantity_milli)} ${esc(b.unit)}</td><td><input class="count-qty" inputmode="decimal" data-key="${esc(key)}" data-product="${b.product_id}" data-lot="${esc(b.lot)}" data-expected="${b.quantity_milli}" value="${esc(draft[key] ?? '')}" aria-label="Counted ${esc(b.name)} ${esc(b.lot)}"></td><td class="count-diff"></td></tr>`;
      }),
      'No stock recorded at this location.',
    )}
    <div class="checkout-summary" id="count-summary"></div>${formActions('Post count and adjust stock')}</form>`,
    true,
  );
  $('#count-location').addEventListener('change', e => stockCountDialog(Number(e.target.value)));
  const update = () => {
    const values = {};
    let counted = 0,
      differences = 0;
    document.querySelectorAll('.count-qty').forEach(input => {
      const cell = input.closest('tr').querySelector('.count-diff');
      if (input.value.trim() === '') {
        cell.textContent = '';
        return;
      }
      values[input.dataset.key] = input.value.trim();
      counted++;
      const diff = Math.round(Number(input.value) * 1000) - Number(input.dataset.expected);
      if (diff) differences++;
      cell.innerHTML = diff ? `<span class="badge ${diff > 0 ? 'green' : 'red'}">${diff > 0 ? '+' : ''}${quantity(diff)}</span>` : '<span class="muted">✓</span>';
    });
    values.notes = $('.modal input[name=notes]').value;
    try {
      localStorage.setItem(draftKey, JSON.stringify(values));
    } catch {}
    $('#count-summary').innerHTML = `<span>${counted} of ${document.querySelectorAll('.count-qty').length} lines counted</span><b class="${differences ? 'due' : 'ok'}">${differences ? differences + ' difference' + (differences === 1 ? '' : 's') + ' will be adjusted' : 'No differences'}</b>`;
  };
  document.querySelectorAll('.count-qty, .modal input[name=notes]').forEach(i => i.addEventListener('input', update));
  update();
  bindForm(async (fd, key) => {
    const lines = [...document.querySelectorAll('.count-qty')]
      .filter(i => i.value.trim() !== '')
      .map(i => ({ product_id: Number(i.dataset.product), lot: i.dataset.lot, expected: (Number(i.dataset.expected) / 1000).toFixed(3), counted: i.value.trim() }));
    if (!lines.length) throw new Error('Type the counted quantity for at least one line.');
    const r = await api('stock-counts', 'POST', { location_id: Number($('#count-location').value), notes: fd.get('notes'), lines }, key);
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    closeModal();
    toast(`${r.number} posted · ${r.adjustments} adjustment${r.adjustments === 1 ? '' : 's'}`);
    await inventoryPage();
  });
}
