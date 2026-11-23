/* Atelier Perfume ERP · Wholesale and purchasing documents: quotations, invoices, payments, returns and contacts. */
'use strict';

async function documentsPage(purchase) {
  await loadLists();
  const d = await api('documents' + (purchase ? '?kind=Purchase' : ''));
  const docs = purchase ? d.documents : d.documents.filter(x => x.kind !== 'Purchase');
  $('#content').innerHTML =
    pageHead(
      purchase ? 'Purchasing' : 'Wholesale & invoices',
      purchase
        ? 'Record supplier purchases and receive stock into a location.'
        : 'Quotations, posted invoices, payments and full returns.',
      `<button class="secondary" onclick="contactsDialog('${purchase ? 'supplier' : 'customer'}')">${purchase ? 'Suppliers' : 'Customers'}</button>${purchase ? '' : `<button class="secondary" onclick="documentDialog('Quotation')">+ Quotation</button>`}<button class="primary" onclick="documentDialog('${purchase ? 'Purchase' : 'Invoice'}')">+ ${purchase ? 'Receive purchase' : 'Create invoice'}</button>`,
    ) +
    `<div class="notice">${purchase ? 'A posted purchase receives the listed goods immediately. Partial purchase orders and supplier returns are later-stage features.' : 'Invoices deduct stock immediately. Quotations do not reserve or deduct stock. Separate sales orders, partial deliveries and partial returns are later-stage features.'}</div>` +
    panel(
      purchase ? 'Purchase receipts' : 'Sales documents',
      table(
        ['Number', 'Customer / supplier', 'Status', 'Total', 'Paid', 'Balance', 'Date'],
        docs.map(
          d =>
            `<tr><td><button class="subtle" onclick="documentDetail(${d.id})">${esc(d.number)}</button><small>${esc(d.kind)}</small></td><td>${esc(d.contact || 'Walk-in')}</td><td>${badge(d.status)}</td><td>${money(d.total_cents)}</td><td>${money(d.paid_cents)}</td><td>${money(['Returned', 'Declined', 'Draft', 'Accepted'].includes(d.status) ? 0 : d.total_cents - d.paid_cents)}</td><td>${date(d.created_at)}</td></tr>`,
        ),
      ),
      '<a href="/api/export?type=sales" class="subtle">Export CSV ↓</a>',
    );
}

function contactsDialog(kind = 'customer') {
  const list = state.contacts.filter(c => c.kind === kind);
  modal(
    kind === 'supplier' ? 'Supplier directory' : 'Customer directory',
    table(
      ['Name', 'Contact', 'Credit limit'],
      list.map(
        c =>
          `<tr><td>${esc(c.name)}</td><td>${esc(c.phone || c.email || '—')}</td><td>${money(c.credit_cents)}</td></tr>`,
      ),
    ) +
      `<div class="form-actions"><button class="primary" onclick="contactCreate('${kind}')">+ Add ${kind}</button></div>`,
    true,
  );
}

function contactCreate(kind) {
  modal(
    'Add ' + kind,
    `<form><div class="form-grid">${field('Name / company', 'name')}${field('Email', 'email', '', 'email')}${field('Phone', 'phone')}${field('Tax identifier', 'tax_id')}${field('Credit limit', 'credit', '0.00')}${field('Payment terms · days', 'terms_days', '0', 'number')}<label class="span2">Address<textarea name="address"></textarea></label></div>${formActions('Save contact')}</form>`,
  );
  bindForm(async fd => {
    await api('contacts', 'POST', { ...Object.fromEntries(fd), kind });
    await loadLists();
    contactsDialog(kind);
    toast('Contact created');
  });
}

function documentDialog(kind) {
  const selectable = state.products.filter(
    p => p.active && (kind === 'Purchase' ? p.kind !== 'service' : p.sales_allowed),
  );
  state.docProducts = selectable;
  modal(
    kind === 'Purchase'
      ? 'Receive a purchase'
      : kind === 'Quotation'
        ? 'Create a quotation'
        : 'Create a wholesale invoice',
    `<form><div class="form-grid"><label>${kind === 'Purchase' ? 'Supplier' : 'Customer'}<select name="contact_id">${options(
      state.contacts.filter(c => c.kind === (kind === 'Purchase' ? 'supplier' : 'customer')),
      'name',
      '',
      'Walk-in / no contact',
    )}</select></label><label>Stock location<select name="location_id">${options(state.boot.locations, 'name', state.location)}</select></label>${field('Supplier bill / customer reference', 'bill_reference', '')}${field('Payment due date', 'due_date', '', 'date')}${field('Payment now (quotations: zero)', 'paid', '0.00')}<label>Payment method<select name="method">${selectOptions(['Credit', 'Cash', 'Card', 'Bank'], 'Credit')}</select></label></div><div class="section-label">Items · quantity / unit price / line discount</div><div id="doc-lines"></div><button type="button" class="secondary" onclick="addDocumentLine('${kind}')">+ Add item</button><div class="document-total" id="draft-total">Add items to see the estimated total.</div><label style="margin-top:15px">Notes<textarea name="notes"></textarea></label>${formActions(kind === 'Quotation' ? 'Save quotation' : 'Post document')}</form>`,
    true,
  );
  addDocumentLine(kind);
  bindForm(async (fd, key) => {
    const lines = Array.from(document.querySelectorAll('#doc-lines .line-editor')).map(el => ({
      product_id: Number(el.querySelector('[data-product]').value),
      quantity: el.querySelector('[data-qty]').value,
      price: el.querySelector('[data-price]').value,
      discount: el.querySelector('[data-discount]').value,
    }));
    const v = { ...Object.fromEntries(fd), kind, lines };
    v.contact_id = v.contact_id ? Number(v.contact_id) : null;
    const r = await api('documents', 'POST', v, key);
    closeModal();
    toast(r.number + ' posted');
    await render();
    await documentDetail(r.id);
  });
}

function addDocumentLine(kind) {
  const div = document.createElement('div');
  div.className = 'line-editor';
  div.innerHTML = `<select data-product required>${options(state.docProducts)}</select><input data-qty aria-label="Quantity" value="1" inputmode="decimal"><input data-price aria-label="Unit price" value="0.00" inputmode="decimal"><input data-discount aria-label="Line discount" value="0.00" inputmode="decimal"><button type="button" class="remove" aria-label="Remove line">×</button>`;
  div.querySelector('[data-product]').onchange = () => {
    const p = state.docProducts.find(p => p.id === Number(div.querySelector('[data-product]').value));
    div.querySelector('[data-price]').value = decimal(kind === 'Purchase' ? p?.cost_cents : p?.price_cents);
    draftTotal();
  };
  div.querySelector('.remove').onclick = () => {
    div.remove();
    draftTotal();
  };
  div.addEventListener('input', draftTotal);
  $('#doc-lines').append(div);
}

function draftTotal() {
  let total = 0;
  document.querySelectorAll('#doc-lines .line-editor').forEach(el => {
    const p = state.docProducts.find(p => p.id === Number(el.querySelector('[data-product]').value));
    const subtotal =
      Number(el.querySelector('[data-qty]').value) * Number(el.querySelector('[data-price]').value) -
      Number(el.querySelector('[data-discount]').value);
    total += Math.max(0, subtotal) * (1 + (p?.tax_bp || 0) / 10000);
  });
  $('#draft-total').innerHTML =
    `<span class="muted tiny">Estimated total · server validates and rounds each line</span><strong>${money(Math.round(total * 100))}</strong>`;
}

async function documentDetail(id) {
  try {
    const d = await api('documents/' + id);
    const p = d.document;
    const s = p.seller_snapshot
      ? typeof p.seller_snapshot === 'string'
        ? JSON.parse(p.seller_snapshot)
        : p.seller_snapshot
      : state.boot.settings;
    modal(
      p.number,
      `<article class="document-preview"><div class="document-header"><div><p class="eyebrow">${esc(s.company_name)}</p><h1>${esc(p.kind === 'Sale' ? 'SALES RECEIPT' : p.kind.toUpperCase())}</h1><p class="muted tiny">${esc(s.address || '')}<br>${esc(s.phone || '')} · ${esc(s.email || '')}<br>${s.tax_id ? 'Tax ID: ' + esc(s.tax_id) : ''}</p></div><div class="right"><h2>${esc(p.number)}</h2>${badge(p.status)}<p class="tiny muted" style="margin-top:10px">${date(p.created_at)}${p.due_date ? '<br>Due ' + date(p.due_date) : ''}${p.bill_reference ? '<br>Reference: ' + esc(p.bill_reference) : ''}</p></div></div><div class="document-meta"><div><small class="muted">${p.kind === 'Purchase' ? 'Supplier' : 'Customer'}</small><br><b>${esc(d.contact?.name || 'Walk-in customer')}</b><br><small>${esc(d.contact?.address || '')}<br>${esc(d.contact?.phone || '')} ${esc(d.contact?.email || '')}${d.contact?.tax_id ? '<br>Tax ID: ' + esc(d.contact.tax_id) : ''}</small></div><div class="right"><small class="muted">Payment method</small><br>${esc(p.method)}</div></div>${table(
        ['Item', 'Qty / unit', 'Unit price', 'Discount', 'Tax', 'Total'],
        d.lines.map(
          l =>
            `<tr><td>${esc(l.name)}</td><td>${quantity(l.quantity_milli)} ${esc(l.unit)}</td><td>${money(l.price_cents)}</td><td>${money(l.discount_cents)}</td><td>${money(l.tax_cents)}</td><td>${money(l.total_cents)}</td></tr>`,
        ),
      )}<div class="document-total"><p>Subtotal ${money(p.subtotal_cents)} · Tax ${money(p.tax_cents)}</p><strong>${money(p.total_cents)}</strong><small>Paid ${money(p.paid_cents)} · ${p.status === 'Returned' ? 'Returned' : `Balance ${money(p.total_cents - p.paid_cents)}`}</small></div><p class="tiny muted" style="margin-top:20px">${esc(p.notes || 'Thank you for your business.')}</p></article>${invoiceCostView(d)}<div class="form-actions"><button class="secondary" onclick="window.print()">Print / save PDF</button>${can('manager', 'accountant') && p.status === 'Draft' && p.kind === 'Quotation' ? `<button class="secondary" onclick="quotationAction(${id},'decline')">Decline</button><button class="primary" onclick="quotationAction(${id},'accept')">Accept quotation</button>` : ''}${can('manager', 'accountant') && p.status === 'Posted' && p.kind !== 'Return' ? `${p.paid_cents < p.total_cents ? `<button class="primary" onclick="paymentDialog(${id},${p.total_cents - p.paid_cents})">Record payment</button>` : ''}${['Sale', 'Invoice'].includes(p.kind) ? `<button class="danger" onclick="returnDialog(${id})">Full return</button>` : ''}` : ''}</div>`,
      true,
    );
  } catch (e) {
    toast(e.message);
  }
}

async function quotationAction(id, action) {
  try {
    await api('documents/' + id, 'POST', { action });
    toast('Quotation ' + (action === 'accept' ? 'accepted' : 'declined'));
    await render();
    await documentDetail(id);
  } catch (e) {
    toast(e.message);
  }
}

function paymentDialog(id, balance) {
  modal(
    'Record payment',
    `<form><p>Outstanding: <b>${money(balance)}</b></p>${field('Payment amount', 'amount', decimal(balance))}<label style="margin-top:15px">Method<select name="method">${selectOptions(['Cash', 'Card', 'Bank'])}</select></label>${formActions('Record payment')}</form>`,
  );
  bindForm(async (fd, key) => {
    await api('documents/' + id, 'POST', { action: 'payment', ...Object.fromEntries(fd) }, key);
    closeModal();
    toast('Payment recorded');
    await render();
    await documentDetail(id);
  });
}

function returnDialog(id) {
  modal(
    'Full return and refund record',
    `<form><div class="notice">This reverses the complete sale once. Record the real refund outside this application if it was paid by card/bank; there is no payment-provider connection.</div><label>Returned stock condition<select name="condition">${selectOptions(['Restock', 'Do not restock'])}</select></label>${formActions('Confirm full return')}</form>`,
  );
  bindForm(async (fd, key) => {
    const r = await api('documents/' + id, 'POST', { action: 'return', ...Object.fromEntries(fd) }, key);
    closeModal();
    toast('Return recorded · refund ' + money(r.refund_cents));
    await render();
    await documentDetail(r.id);
  });
}

function invoiceCostView(d) {
  const p = d.profit;
  if (!p) return '';
  return `<section class="internal-costs"><div class="section-label">Internal cost & profit · excluded from customer print</div>${!p.active ? '<p class="notice">This sale has been returned and is excluded from active sales profit.</p>' : ''}${table(
    ['Product', 'Quantity / unit', 'Sale ex. tax', 'Stock cost', 'Gross profit', 'Source lots'],
    d.lines.map(
      l =>
        `<tr><td>${esc(l.name)}</td><td>${quantity(l.quantity_milli)} ${esc(l.unit)}</td><td>${money(l.subtotal_cents)}</td><td>${l.cogs_cents === null || l.cogs_cents === undefined ? 'Not recorded' : money(l.cogs_cents)}</td><td>${l.cogs_cents === null || l.cogs_cents === undefined ? 'Not recorded' : money(l.subtotal_cents - l.cogs_cents)}</td><td>${(l.cost_allocations || []).map(a => esc(a.lot || a.cost_basis)).join(', ') || '—'}</td></tr>`,
    ),
  )}<div class="metric-grid"><div><small>Sales excluding tax</small><b>${money(p.revenue_cents)}</b></div><div><small>Cost of goods sold</small><b>${p.cogs_cents === null ? 'Not recorded' : money(p.cogs_cents)}</b></div><div><small>Gross profit</small><b>${p.gross_profit_cents === null ? 'Not recorded' : money(p.gross_profit_cents)}</b></div></div><p class="form-hint">${p.estimated ? 'Includes costs estimated from opening/configured values.' : 'Costs are captured from the stock lots consumed by this sale.'} General business expenses are excluded.</p></section>`;
}
