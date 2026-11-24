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
      `<button class="secondary" onclick="shiftListDialog()">Shift reports</button><button class="secondary" onclick="shiftDialog()">${state.openShift ? 'Close shift' : 'Open shift'} · ${state.openShift ? 'active' : 'required'}</button>`,
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
  let total = state.cartTotal;
  modal(
    'Take payment',
    `<form class="checkout"><div class="checkout-total"><span>Total to pay<small id="customer-price-note"></small></span><strong>${money(total)}</strong></div>
    <label>Customer<select name="contact_id">${options(state.contacts.filter(c => c.kind === 'customer'), 'name', '', 'Walk-in customer')}</select></label><div id="loyalty-box" class="loyalty-box" hidden></div>
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
    row.innerHTML = `<select aria-label="Payment method">${selectOptions(state.loyalty?.enabled ? ['Cash', 'Card', 'Bank', 'Points'] : ['Cash', 'Card', 'Bank'], method)}</select><input aria-label="Amount" inputmode="decimal" value="${decimal(cents)}"><button type="button" class="subtle" aria-label="Remove payment">×</button>`;
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
  state.loyalty = null;
  $('.modal select[name=contact_id]').addEventListener('change', async e => {
    const id = Number(e.target.value);
    const pricing = id ? await api(`contacts/${id}/pricing`).catch(() => null) : null;
    total = cartTotalFor(pricing);
    $('.checkout-total strong').textContent = money(total);
    $('#customer-price-note').textContent = total !== state.cartTotal ? `Customer price applied · list price ${money(state.cartTotal)}` : '';
    rows.innerHTML = '';
    addRow('Cash', total);
    refresh();
    state.loyalty = id ? await api(`contacts/${id}/loyalty`).catch(() => null) : null;
    const box = $('#loyalty-box');
    if (!state.loyalty?.enabled) {
      box.hidden = true;
      return;
    }
    const worth = state.loyalty.balance * state.loyalty.point_value_cents;
    box.hidden = false;
    box.innerHTML = `<span>Loyalty points: <b>${state.loyalty.balance.toLocaleString('en')}</b> · worth ${money(worth)}</span>${state.loyalty.balance ? '<button type="button" class="secondary" id="use-points">Use points</button>' : ''}`;
    $('#use-points')?.addEventListener('click', () => {
      const value = state.loyalty.point_value_cents;
      const use = Math.min(worth, Math.floor(total / value) * value);
      if (!use) return toast('Nothing left to pay with points.');
      [...rows.children].forEach(r => r.querySelector('select').value === 'Points' && r.remove());
      const first = rows.firstElementChild;
      if (first) first.querySelector('input').value = decimal(total - use);
      else if (total - use > 0) addRow('Cash', total - use);
      addRow('Points', use);
      refresh();
    });
  });
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
    `<form>${s ? `<p>Expected cash: <b>${money(s.expected_cents)}</b></p><p class="muted tiny">Opening float plus cash receipts less cash refunds and cash expenses paid from the drawer.</p>` : ''}${field(s ? 'Counted cash' : 'Opening cash float', 'amount', '0.00')}${formActions(s ? 'Close shift' : 'Open shift')}</form>`,
  );
  bindForm(async (fd, key) => {
    const r = await api('shifts', 'POST', { action: s ? 'close' : 'open', amount: fd.get('amount') }, key);
    closeModal();
    toast(s ? 'Shift closed · variance ' + money(r.variance_cents) : 'Shift opened');
    await posPage();
    if (s) await shiftReport(r.id);
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


/* ── End-of-day (Z) report ─────────────────────────────────────────────── */

async function shiftListDialog() {
  const d = await api('shifts' + (can('manager') ? '?all=1' : ''));
  modal(
    'Shift reports',
    table(
      ['Cashier', 'Opened', 'Closed', 'Expected cash', 'Counted', 'Difference', ''],
      d.shifts.map(
        s => `<tr><td>${esc(s.cashier)}</td><td>${dateTime(s.opened_at)}</td><td>${s.closed_at ? dateTime(s.closed_at) : badge('Open')}</td><td>${money(s.expected_cents)}</td><td>${s.counted_cents === null ? '—' : money(s.counted_cents)}</td><td>${s.variance_cents === null ? '—' : varianceText(s.variance_cents)}</td><td><button class="subtle" onclick="shiftReport(${s.id})">Report</button></td></tr>`,
      ),
      'No shifts yet.',
    ),
    true,
  );
}

function dateTime(value) {
  return new Date(String(value).replace(' ', 'T')).toLocaleString('en', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function varianceText(cents) {
  return cents === 0 ? '<span class="ok-text">0.00 ✓</span>' : `<span class="${cents < 0 ? 'overdue' : 'due-text'}">${cents > 0 ? '+' : '−'}${money(Math.abs(cents))}</span>`;
}

async function shiftReport(id) {
  const r = await api(`shifts/${id}/report`);
  state.zReport = r;
  const c = r.cash;
  const row = (label, value) => `<tr><th>${label}</th><td>${value}</td></tr>`;
  modal(
    'End-of-day report',
    `<article class="z-report">
      <p class="muted">${esc(r.shift.cashier)} · ${dateTime(r.shift.opened_at)} – ${r.shift.closed_at ? dateTime(r.shift.closed_at) : 'still open'}</p>
      <div class="stats">${statTile('Sales', money(r.sales.total_cents), `${r.sales.count} sale${r.sales.count === 1 ? '' : 's'} incl. VAT`)}${statTile('VAT collected', money(r.sales.vat_cents), 'Net ' + money(r.sales.net_cents))}${statTile('Refunds', money(r.returns.refund_cents), `${r.returns.count} return${r.returns.count === 1 ? '' : 's'}`)}${statTile('Cash difference', c.variance_cents === null ? 'Open' : varianceText(c.variance_cents), c.counted_cents === null ? 'Shift not closed yet' : 'Counted ' + money(c.counted_cents))}</div>
      <div class="dashboard-grid"><div>
      ${panel('Payments received', table(['Method', 'Payments', 'Amount'], r.payments.map(p => `<tr><td>${esc(p.method)}</td><td>${p.count}</td><td>${money(p.amount_cents)}</td></tr>`), 'No payments in this shift.'))}
      ${panel('Best-selling items', table(['Item', 'Quantity', 'Total'], r.items.map(i => `<tr><td>${esc(i.name)}</td><td>${quantity(i.quantity_milli)} ${esc(i.unit)}</td><td>${money(i.total_cents)}</td></tr>`), 'No items sold.'))}
      </div><div>
      ${panel('Cash drawer', `<table class="ti-totals z-cash">${row('Opening float', money(c.opening_cents))}${row('Cash sales and payments', money(r.payments.filter(p => p.method === 'Cash').reduce((a, p) => a + p.amount_cents, 0)))}${row('Cash refunds', '−' + money(r.returns.cash_refund_cents))}${row('Cash expenses from drawer', '−' + money(r.expenses.reduce((a, e) => a + Number(e.amount_cents), 0)))}<tr class="grand"><th>Expected cash</th><td>${money(c.expected_cents)}</td></tr>${row('Counted cash', c.counted_cents === null ? '—' : money(c.counted_cents))}${row('Difference', c.variance_cents === null ? '—' : varianceText(c.variance_cents))}</table>`)}
      ${r.expenses.length ? panel('Drawer expenses', table(['Expense', 'Amount'], r.expenses.map(e => `<tr><td>${esc(e.number)} · ${esc(e.description)}</td><td>${money(e.amount_cents)}</td></tr>`))) : ''}
      </div></div></article><div class="form-actions"><button class="secondary" onclick="window.print()">Print A4 / save PDF</button><button class="primary" onclick="printZReport()">Print 80 mm</button></div>`,
    true,
  );
}

function printZReport() {
  const r = state.zReport;
  const s = state.boot.settings;
  const c = r.cash;
  const line = (en, ar, value) => `<tr><td>${en}<br><span class="ar">${ar}</span></td><td class="r">${value}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Z report</title><style>
    @page { size: 80mm auto; margin: 4mm; } body { font: 12px/1.35 ui-monospace, Menlo, Consolas, monospace; width: 72mm; margin: 0; color: #000; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; vertical-align: top; } .ar { font-family: Tahoma, "Noto Sans Arabic", sans-serif; font-size: 11px; }
    h1 { font-size: 15px; margin: 2px 0; } hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; } table { width: 100%; border-collapse: collapse; } td { padding: 1px 0; }
  </style></head><body>
    <div class="c"><h1>${esc(s.company_name)}</h1><b>END OF DAY (Z) REPORT</b><br><span class="ar">تقرير نهاية اليوم</span></div><hr>
    <p>Cashier / الكاشير: ${esc(r.shift.cashier)}<br>${dateTime(r.shift.opened_at)} – ${r.shift.closed_at ? dateTime(r.shift.closed_at) : 'open'}</p><hr>
    <table>${line('Sales count', 'عدد المبيعات', r.sales.count)}${line('Net sales', 'صافي المبيعات', money(r.sales.net_cents))}${line('VAT', 'الضريبة', money(r.sales.vat_cents))}${line('Total sales', 'إجمالي المبيعات', '<b>' + money(r.sales.total_cents) + '</b>')}${line('Discounts', 'الخصومات', money(r.sales.discount_cents))}</table><hr>
    <table>${r.payments.map(p => line(esc(p.method) + ' (' + p.count + ')', {Cash: 'نقدًا', Card: 'بطاقة', Bank: 'تحويل بنكي'}[p.method] || '', money(p.amount_cents))).join('')}${line('Refunds (' + r.returns.count + ')', 'المبالغ المستردة', '−' + money(r.returns.refund_cents))}</table><hr>
    <table>${line('Opening float', 'الرصيد الافتتاحي', money(c.opening_cents))}${line('Expected cash', 'النقد المتوقع', '<b>' + money(c.expected_cents) + '</b>')}${line('Counted cash', 'النقد المعدود', c.counted_cents === null ? '—' : money(c.counted_cents))}${line('Difference', 'الفرق', c.variance_cents === null ? '—' : (c.variance_cents > 0 ? '+' : c.variance_cents < 0 ? '−' : '') + money(Math.abs(c.variance_cents)))}</table><hr>
    <p class="c">Printed ${new Date().toLocaleString('en')}</p>
    <script>window.addEventListener('load', () => window.print());<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=420,height=720');
  if (!w) return toast('Allow pop-ups for this site to print.');
  w.document.open();
  w.document.write(html);
  w.document.close();
}


/** Basket total for a customer's price list, computed the same way as the server (special price, else discount %). */
function cartTotalFor(pricing) {
  if (!pricing) return state.cartTotal;
  return state.cart.reduce((sum, line) => {
    const p = state.products.find(x => x.id === line.id);
    const special = pricing.prices.find(x => x.product_id === p.id);
    const gross = Math.round(line.qty * (special ? special.price_cents : p.price_cents));
    const net = gross - (special ? 0 : Math.round((gross * pricing.discount_bp) / 10000));
    return sum + net + Math.round((net * p.tax_bp) / 10000);
  }, 0);
}
