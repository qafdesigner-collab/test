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
      )}</div></div></section><section class="panel cart-panel"><div class="panel-head"><h2>Current basket</h2><span class="cart-actions" id="cart-actions"></span></div><div class="panel-body" id="cart"></div></section></div>`;
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
  const held = heldBaskets().length;
  $('#cart-actions').innerHTML = `${held ? `<button class="subtle" onclick="heldDialog()">Held (${held})</button>` : ''}${lines.length ? '<button class="subtle" onclick="holdBasket()">Hold</button><button class="subtle" onclick="state.cart=[];cartRender()">Clear</button>' : ''}`;
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

/** Cents from a typed amount such as "12.5". */
function toCents(value) {
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Rounded cash amounts a customer is likely to hand over. */
function cashSuggestions(cents) {
  const steps = [1000, 5000, 10000, 50000, 100000];
  const values = new Set([cents]);
  steps.forEach(step => values.add((Math.floor(cents / step) + 1) * step));
  return [...values].sort((a, b) => a - b).slice(0, 5);
}

function checkoutDialog() {
  if (!state.openShift) {
    shiftDialog();
    return;
  }
  const total = state.cartTotal;
  modal(
    'Take payment',
    `<form class="checkout"><div class="checkout-total"><span>Total to pay</span><strong>${money(total)}</strong></div>
    <label>Customer<select name="contact_id">${options(state.contacts.filter(c => c.kind === 'customer'), 'name', '', 'Walk-in customer')}</select></label>
    <div class="section-label">Payment</div>
    <div class="quick-methods"><button type="button" class="secondary" data-all="Cash">All cash</button><button type="button" class="secondary" data-all="Card">All card</button><button type="button" class="secondary" data-all="Bank">All bank transfer</button><button type="button" class="subtle" id="add-payment">+ Split payment</button></div>
    <div id="payment-rows"></div>
    <div id="cash-box" class="cash-box" hidden><label>Cash received from customer<input id="tendered" inputmode="decimal" autocomplete="off"></label><div class="cash-chips" id="cash-chips"></div><div class="change-due"><span>Change to give</span><strong id="change-due">${money(0)}</strong></div></div>
    <div class="checkout-summary" id="checkout-summary"></div>
    <p class="form-hint">Card records do not charge a terminal. Any amount left unpaid goes on the customer's account (credit) and needs a customer.</p>${formActions('Complete sale')}</form>`,
  );
  const rows = $('#payment-rows');
  const addRow = (method, cents) => {
    if (rows.children.length >= 4) return;
    const row = document.createElement('div');
    row.className = 'payment-row';
    row.innerHTML = `<select aria-label="Payment method">${selectOptions(['Cash', 'Card', 'Bank'], method)}</select><input aria-label="Amount" inputmode="decimal" value="${decimal(cents)}"><button type="button" class="subtle" aria-label="Remove payment">×</button>`;
    row.querySelector('button').addEventListener('click', () => {
      row.remove();
      refresh();
    });
    row.querySelectorAll('select, input').forEach(el => el.addEventListener('input', refresh));
    rows.append(row);
  };
  const payments = () => [...rows.children].map(r => ({ method: r.querySelector('select').value, cents: toCents(r.querySelector('input').value) }));
  const refresh = () => {
    const list = payments();
    const paid = list.reduce((a, p) => a + p.cents, 0);
    const cash = list.filter(p => p.method === 'Cash').reduce((a, p) => a + p.cents, 0);
    const remaining = total - paid;
    $('#cash-box').hidden = cash === 0;
    if (cash) {
      $('#cash-chips').innerHTML = cashSuggestions(cash).map(v => `<button type="button" class="chip" data-cash="${v}">${money(v)}</button>`).join('');
      const tendered = $('#tendered').value === '' ? cash : toCents($('#tendered').value);
      const change = tendered - cash;
      $('#change-due').textContent = money(Math.max(0, change));
      $('#change-due').classList.toggle('negative', change < 0);
    }
    rows.querySelectorAll('.payment-row button').forEach(b => (b.hidden = rows.children.length === 1));
    $('#checkout-summary').innerHTML =
      remaining > 0
        ? `<span>Paid ${money(paid)}</span><b class="due">${money(remaining)} on customer account</b>`
        : remaining < 0
          ? `<span>Paid ${money(paid)}</span><b class="over">${money(-remaining)} more than the total</b>`
          : `<span>Paid ${money(paid)}</span><b class="ok">Fully paid ✓</b>`;
  };
  addRow('Cash', total);
  document.querySelectorAll('[data-all]').forEach(b =>
    b.addEventListener('click', () => {
      rows.innerHTML = '';
      addRow(b.dataset.all, total);
      $('#tendered').value = '';
      refresh();
    }),
  );
  $('#add-payment').addEventListener('click', () => {
    const paid = payments().reduce((a, p) => a + p.cents, 0);
    addRow('Card', Math.max(0, total - paid));
    refresh();
  });
  $('#cash-chips').addEventListener('click', e => {
    const chip = e.target.closest('[data-cash]');
    if (!chip) return;
    $('#tendered').value = decimal(Number(chip.dataset.cash));
    refresh();
  });
  $('#tendered').addEventListener('input', refresh);
  refresh();
  bindForm(async (fd, key) => {
    const list = payments().filter(p => p.cents > 0);
    const cash = list.filter(p => p.method === 'Cash').reduce((a, p) => a + p.cents, 0);
    const body = {
      kind: 'Sale',
      location_id: state.location,
      contact_id: fd.get('contact_id') ? Number(fd.get('contact_id')) : null,
      lines: state.cart.map(l => ({ product_id: l.id, quantity: String(l.qty) })),
    };
    if (list.length) {
      body.payments = list.map(p => ({ method: p.method, amount: decimal(p.cents) }));
      if (cash && $('#tendered').value !== '') body.tendered = $('#tendered').value;
    } else {
      body.method = 'Credit';
      body.paid = '0';
    }
    const r = await api('documents', 'POST', body, key);
    state.cart = [];
    closeModal();
    toast(r.change_cents ? `${r.number} completed · give change ${money(r.change_cents)}` : `${r.number} completed`);
    await posPage();
    await documentDetail(r.id);
  });
}

/* ── Held baskets: park a customer's basket and serve the next one. Saved in this browser. ── */
function heldKey() {
  return 'atelier-held-' + state.boot.user.id;
}

function heldBaskets() {
  try {
    return JSON.parse(localStorage.getItem(heldKey()) || '[]');
  } catch {
    return [];
  }
}

function saveHeld(list) {
  try {
    localStorage.setItem(heldKey(), JSON.stringify(list));
  } catch {
    toast('This browser cannot save held baskets.');
  }
}

function holdBasket() {
  if (!state.cart.length) return;
  modal(
    'Hold this basket',
    `<form><label>Name or note · for example the customer's name<input name="label" maxlength="60" placeholder="Basket ${heldBaskets().length + 1}"></label>${formActions('Hold basket')}</form>`,
  );
  bindForm(async fd => {
    const list = heldBaskets();
    list.push({ id: Date.now(), label: fd.get('label') || `Basket ${list.length + 1}`, at: new Date().toISOString(), cart: state.cart, total: state.cartTotal });
    saveHeld(list.slice(-10));
    state.cart = [];
    closeModal();
    toast('Basket held');
    cartRender();
  });
}

function heldDialog() {
  const list = heldBaskets();
  modal(
    'Held baskets',
    list.length
      ? `<div class="held-list">${list
          .map(
            h =>
              `<div class="list-row"><span class="grow"><b>${esc(h.label)}</b><small>${h.cart.length} item${h.cart.length === 1 ? '' : 's'} · ${money(h.total)} · ${new Date(h.at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</small></span><button class="subtle" onclick="discardHeld(${h.id})">Discard</button><button class="primary" onclick="resumeHeld(${h.id})">Resume</button></div>`,
          )
          .join('')}</div>`
      : '<div class="empty">No held baskets.</div>',
  );
}

function resumeHeld(id) {
  const list = heldBaskets();
  const held = list.find(h => h.id === id);
  if (!held) return;
  if (state.cart.length && !confirm('Replace the current basket with this held basket?')) return;
  state.cart = held.cart.filter(l => state.products.some(p => p.id === l.id));
  saveHeld(list.filter(h => h.id !== id));
  closeModal();
  cartRender();
}

function discardHeld(id) {
  saveHeld(heldBaskets().filter(h => h.id !== id));
  heldDialog();
  cartRender();
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
