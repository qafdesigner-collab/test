/* Atelier Perfume ERP · Point of sale: basket, checkout and cashier shifts. */
'use strict';

async function posPage() {
  await loadLists();
  const d = await api('shifts');
  state.openShift = d.shifts.find(s => !s.closed_at);
  $('#content').innerHTML =
    pageHead(
      'Point of sale',
      'Find a fragrance. Build the basket. Make their day.',
      `<button class="secondary" onclick="shiftDialog()">${state.openShift ? 'Close shift' : 'Open shift'} · ${state.openShift ? 'active' : 'required'}</button>`,
    ) +
    (!state.openShift ? '<div class="notice">Open your cashier shift before posting a sale.</div>' : '') +
    `<div class="pos-layout"><section>${catalogueToolbar(true)}<div id="product-results"><div class="catalogue">${filteredProducts(
      true,
    )
      .map(p => productCard(p, true))
      .join(
        '',
      )}</div></div></section><section class="panel cart-panel"><div class="panel-head"><h2>Current basket</h2><button class="subtle" onclick="state.cart=[];cartRender()">Clear</button></div><div class="panel-body" id="cart"></div></section></div>`;
  bindFilters(true);
  cartRender();
}

function cartAdd(id) {
  const p = state.products.find(p => p.id === id);
  if (p.kind !== 'service' && p.stock_milli <= 0) {
    toast('This product has no available stock.');
    return;
  }
  const prior = state.cart.find(l => l.id === id);
  if (prior) prior.qty++;
  else state.cart.push({ id, qty: 1 });
  cartRender();
}

function cartChange(id, n) {
  const line = state.cart.find(l => l.id === id);
  line.qty += n;
  if (line.qty < 1) state.cart = state.cart.filter(l => l.id !== id);
  cartRender();
}

function cartRender() {
  const el = $('#cart');
  if (!el) return;
  const lines = state.cart.map(l => ({ ...l, p: state.products.find(p => p.id === l.id) }));
  let subtotal = 0,
    tax = 0;
  lines.forEach(l => {
    const net = Math.round(l.qty * l.p.price_cents);
    subtotal += net;
    tax += Math.round((net * l.p.tax_bp) / 10000);
  });
  state.cartTotal = subtotal + tax;
  el.innerHTML = lines.length
    ? lines
        .map(
          l =>
            `<div class="cart-line"><div><b>${esc(l.p.name)}</b><br><small>${money(l.p.price_cents)} / ${esc(l.p.unit)}</small><div class="cart-quantity"><button onclick="cartChange(${l.id},-1)" aria-label="Decrease quantity">−</button><input aria-label="Quantity in ${esc(l.p.unit)}" inputmode="decimal" value="${l.qty}" onchange="cartSet(${l.id},this.value)"><small>${esc(l.p.unit)}</small><button onclick="cartChange(${l.id},1)" aria-label="Increase quantity">+</button></div></div><strong>${money(Math.round(l.qty * l.p.price_cents))}</strong></div>`,
        )
        .join('') +
      `<div class="cart-summary"><div><span>Subtotal</span><b>${money(subtotal)}</b></div><div><span>Tax</span><b>${money(tax)}</b></div><div class="total"><span>Total</span><b>${money(state.cartTotal)}</b></div></div><button class="primary full" onclick="checkoutDialog()">Take payment →</button>`
    : '<div class="empty">Your basket is empty.<br>Select a product to begin.</div>';
}

function checkoutDialog() {
  if (!state.openShift) {
    shiftDialog();
    return;
  }
  modal(
    'Complete sale',
    `<form><div class="document-total"><span>Total to pay</span><strong>${money(state.cartTotal)}</strong></div><div class="form-grid" style="margin-top:20px"><label class="span2">Customer<select name="contact_id">${options(
      state.contacts.filter(c => c.kind === 'customer'),
      'name',
      '',
      'Walk-in customer',
    )}</select></label>${field('Amount received', 'paid', decimal(state.cartTotal))}<label>Payment method<select name="method">${selectOptions(['Cash', 'Card', 'Bank', 'Credit'])}</select></label></div><p class="form-hint">Enter the exact applied payment. Tender/change and split payments are not yet supported. Card records do not charge a terminal.</p>${formActions('Post sale')}</form>`,
  );
  bindForm(async (fd, key) => {
    const v = Object.fromEntries(fd);
    v.contact_id = v.contact_id ? Number(v.contact_id) : null;
    v.kind = 'Sale';
    v.location_id = state.location;
    v.lines = state.cart.map(l => ({ product_id: l.id, quantity: String(l.qty) }));
    const r = await api('documents', 'POST', v, key);
    state.cart = [];
    closeModal();
    toast(r.number + ' completed');
    await posPage();
    await documentDetail(r.id);
  });
}

function shiftDialog() {
  const s = state.openShift;
  modal(
    s ? 'Close cashier shift' : 'Open cashier shift',
    `<form>${s ? `<p>Expected cash: <b>${money(s.expected_cents)}</b></p><p class="muted tiny">Opening float plus cash receipts less recorded cash refunds.</p>` : ''}${field(s ? 'Counted cash' : 'Opening cash float', 'amount', '0.00')}${formActions(s ? 'Close shift' : 'Open shift')}</form>`,
  );
  bindForm(async (fd, key) => {
    const r = await api('shifts', 'POST', { action: s ? 'close' : 'open', amount: fd.get('amount') }, key);
    closeModal();
    toast(s ? 'Shift closed · variance ' + money(r.variance_cents) : 'Shift opened');
    await posPage();
  });
}

function cartSet(id, value) {
  const p = state.products.find(p => p.id === id);
  if (
    !/^\d+(\.\d{1,3})?$/.test(value) ||
    Number(value) <= 0 ||
    (['piece', 'bottle', 'box', 'carton'].includes(p.unit) && !Number.isInteger(Number(value)))
  ) {
    toast('Enter a positive quantity; counted products need whole units.');
    cartRender();
    return;
  }
  const line = state.cart.find(l => l.id === id);
  line.qty = Number(value);
  cartRender();
}
