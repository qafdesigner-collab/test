/* Atelier Perfume ERP · Wholesale and purchasing documents: quotations, invoices, payments, returns and contacts. */
'use strict';

async function documentsPage(purchase) {
  await loadLists();
  const d = await api('documents' + (purchase ? '?kind=Purchase,PurchaseOrder,SupplierReturn' : ''));
  const reorder = purchase && can('manager', 'warehouse', 'accountant') ? (await api('reorder')).groups : [];
  const orders = purchase ? d.documents.filter(x => x.kind === 'PurchaseOrder') : [];
  const docs = purchase ? d.documents.filter(x => ['Purchase', 'SupplierReturn'].includes(x.kind)) : d.documents.filter(x => !['Purchase', 'PurchaseOrder', 'SupplierReturn'].includes(x.kind));
  $('#content').innerHTML =
    pageHead(
      purchase ? 'Purchasing' : 'Wholesale & invoices',
      purchase
        ? 'Record supplier purchases and receive stock into a location.'
        : 'Quotations, posted invoices, payments and full returns.',
      `<button class="secondary" onclick="contactsDialog('${purchase ? 'supplier' : 'customer'}')">${purchase ? 'Suppliers' : 'Customers'}</button>${purchase ? `<button class="secondary" onclick="documentDialog('PurchaseOrder')">+ Purchase order</button>` : `<button class="secondary" onclick="documentDialog('Quotation')">+ Quotation</button>`}<button class="primary" onclick="documentDialog('${purchase ? 'Purchase' : 'Invoice'}')">+ ${purchase ? 'Receive purchase' : 'Create invoice'}</button>`,
    ) +
    `<div class="notice">${purchase ? 'Place a purchase order with a supplier, then receive goods against it as they arrive, in one or several deliveries. Receiving adds stock at the ordered price. "Receive purchase" records goods that arrived without an order. To send goods back, open the purchase receipt and choose "Return to supplier".' : 'Invoices deduct stock immediately. Quotations do not reserve or deduct stock. Separate sales orders, partial deliveries and partial returns are later-stage features.'}</div>` +
    (reorder.length ? reorderPanel(reorder) : '') +
    (purchase
      ? panel(
          'Purchase orders',
          table(
            ['Order', 'Supplier', 'Status', 'Ordered value', 'Received', 'Date'],
            orders.map(
              o =>
                `<tr><td><button class="subtle" onclick="documentDetail(${o.id})">${esc(o.number)}</button></td><td>${esc(o.contact || '')}</td><td>${badge(o.status)}</td><td>${money(o.total_cents)}</td><td>${['Received'].includes(o.status) ? 'All' : o.status === 'Partially received' ? 'Part' : '—'}</td><td>${date(o.created_at)}</td></tr>`,
            ),
            'Place your first purchase order with a supplier.',
          ),
        )
      : '') +
    panel(
      purchase ? 'Purchase receipts' : 'Sales documents',
      table(
        ['Number', 'Customer / supplier', 'Status', 'Total', 'Paid', 'Balance', 'Date'],
        docs.map(
          d =>
            `<tr><td><button class="subtle" onclick="documentDetail(${d.id})">${esc(d.number)}</button><small>${esc(d.kind)}</small></td><td>${esc(d.contact || 'Walk-in')}</td><td>${badge(d.status)}</td><td>${money(d.total_cents)}</td><td>${money(d.paid_cents)}</td><td>${money(['Returned', 'Declined', 'Draft', 'Accepted'].includes(d.status) ? 0 : d.total_cents - d.paid_cents - (d.returned_cents || 0) + (d.refunded_cents || 0))}</td><td>${date(d.created_at)}</td></tr>`,
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
      kind === 'customer' ? ['Name', 'Contact', 'Credit limit', 'Discount', ''] : ['Name', 'Contact', 'Credit limit'],
      list.map(
        c =>
          `<tr><td>${esc(c.name)}</td><td>${esc(c.phone || c.email || '—')}</td><td>${money(c.credit_cents)}</td>${kind === 'customer' ? `<td>${c.discount_bp ? (c.discount_bp / 100).toFixed(2).replace(/\.00$/, '') + '%' : '—'}</td><td>${can('manager', 'accountant') ? `<button class="subtle" onclick="priceListDialog(${c.id})">Price list</button>` : ''}</td>` : ''}</tr>`,
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
    p => p.active && (['Purchase', 'PurchaseOrder'].includes(kind) ? p.kind !== 'service' : p.sales_allowed),
  );
  state.docProducts = selectable;
  modal(
    kind === 'PurchaseOrder'
      ? 'New purchase order'
      : kind === 'Purchase'
      ? 'Receive a purchase'
      : kind === 'Quotation'
        ? 'Create a quotation'
        : 'Create a wholesale invoice',
    `<form><div class="form-grid"><label>${['Purchase', 'PurchaseOrder'].includes(kind) ? 'Supplier' : 'Customer'}<select name="contact_id">${options(
      state.contacts.filter(c => c.kind === (['Purchase', 'PurchaseOrder'].includes(kind) ? 'supplier' : 'customer')),
      'name',
      '',
      'Walk-in / no contact',
    )}</select></label><label>Stock location<select name="location_id">${options(state.boot.locations, 'name', state.location)}</select></label>${kind === 'PurchaseOrder' ? `${field('Supplier quote / reference', 'bill_reference', '')}${field('Expected delivery', 'due_date', '', 'date')}<input type="hidden" name="paid" value="0"><input type="hidden" name="method" value="Credit">` : `${field('Supplier bill / customer reference', 'bill_reference', '')}${field('Payment due date', 'due_date', '', 'date')}${field('Payment now (quotations: zero)', 'paid', '0.00')}<label>Payment method<select name="method">${selectOptions(['Credit', 'Cash', 'Card', 'Bank'], 'Credit')}</select></label>`}</div><div class="section-label">Items · quantity / unit price / line discount</div><div id="doc-lines"></div><button type="button" class="secondary" onclick="addDocumentLine('${kind}')">+ Add item</button><div class="document-total" id="draft-total">Add items to see the estimated total.</div><label style="margin-top:15px">Notes<textarea name="notes"></textarea></label>${formActions(kind === 'Quotation' ? 'Save quotation' : kind === 'PurchaseOrder' ? 'Place order' : 'Post document')}</form>`,
    true,
  );
  state.docPricing = null;
  $('.modal select[name=contact_id]').insertAdjacentHTML('afterend', '<small class="muted" id="pricing-note"></small>');
  $('.modal select[name=contact_id]').addEventListener('change', e => useCustomerPricing(Number(e.target.value) || null, kind));
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
    toast(r.number + (kind === 'PurchaseOrder' ? ' ordered' : kind === 'Quotation' ? ' saved' : ' posted'));
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
    div.querySelector('[data-price]').value = decimal(['Purchase', 'PurchaseOrder'].includes(kind) ? p?.cost_cents : customerPrice(p));
    div.querySelector('[data-discount]').dataset.auto = '1';
    applyCustomerDiscount(div);
    draftTotal();
  };
  div.querySelector('[data-discount]').addEventListener('input', e => (e.target.dataset.auto = '0'));
  div.querySelector('[data-qty]').addEventListener('input', () => applyCustomerDiscount(div));
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
      `${["Sale", "Invoice", "Quotation", "Return"].includes(p.kind) ? relatedLinks(d) + taxInvoiceMarkup(d, s) : `<article class="document-preview"><div class="document-header"><div>${state.boot.settings.logo_path ? `<img class="doc-logo" src="${logoUrl()}" alt="">` : ''}<p class="eyebrow">${esc(s.company_name)}</p><h1>${esc(p.kind === 'Sale' ? 'SALES RECEIPT' : p.kind === 'PurchaseOrder' ? 'PURCHASE ORDER' : p.kind === 'SupplierReturn' ? 'RETURN TO SUPPLIER' : p.kind.toUpperCase())}</h1><p class="muted tiny">${esc(s.address || '')}<br>${esc(s.phone || '')} · ${esc(s.email || '')}<br>${s.tax_id ? 'Tax ID: ' + esc(s.tax_id) : ''}</p></div><div class="right"><h2>${esc(p.number)}</h2>${badge(p.status)}<p class="tiny muted" style="margin-top:10px">${date(p.created_at)}${p.due_date ? '<br>Due ' + date(p.due_date) : ''}${p.bill_reference ? '<br>Reference: ' + esc(p.bill_reference) : ''}${d.original ? `<br>${p.kind === 'SupplierReturn' ? 'From receipt' : 'Return of'} <button class="subtle" onclick="documentDetail(${d.original.id})">${esc(d.original.number)}</button>` : ''}${d.purchase_order ? `<br>Against order <button class="subtle" onclick="documentDetail(${d.purchase_order.id})">${esc(d.purchase_order.number)}</button>` : ''}${p.kind === 'PurchaseOrder' && p.due_date ? '<br>Expected ' + date(p.due_date) : ''}${d.quotation ? `<br>From quotation <button class="subtle" onclick="documentDetail(${d.quotation.id})">${esc(d.quotation.number)}</button>` : ''}${d.invoice ? `<br>Invoiced as <button class="subtle" onclick="documentDetail(${d.invoice.id})">${esc(d.invoice.number)}</button>` : ''}</p></div></div><div class="document-meta"><div><small class="muted">${['Purchase', 'PurchaseOrder', 'SupplierReturn'].includes(p.kind) ? 'Supplier' : 'Customer'}</small><br><b>${esc(d.contact?.name || 'Walk-in customer')}</b><br><small>${esc(d.contact?.address || '')}<br>${esc(d.contact?.phone || '')} ${esc(d.contact?.email || '')}${d.contact?.tax_id ? '<br>Tax ID: ' + esc(d.contact.tax_id) : ''}</small></div><div class="right">${p.kind === 'PurchaseOrder' ? `<small class="muted">Deliver to</small><br>${esc(state.boot.locations.find(l => l.id === p.location_id)?.name || '')}</div>` : `<small class="muted">Payment</small><br>${(d.payments || []).length > 1 ? d.payments.map(pay => `${esc(pay.method)} ${money(pay.amount_cents)}`).join('<br>') : esc(p.method)}${p.tendered_cents ? `<br><small class="muted">Cash received ${money(p.tendered_cents)} · change ${money(p.change_cents)}</small>` : ''}</div>`}</div>${table(
        ['Item', 'Qty / unit', 'Unit price', 'Discount', 'Tax', 'Total'],
        d.lines.map(
          l =>
            `<tr><td>${esc(l.name)}${p.kind === 'PurchaseOrder' ? `<small class="returned-note">${quantity(l.received_milli || 0)} of ${quantity(l.quantity_milli)} received</small>` : ''}${Number(l.returned_milli) ? `<small class="returned-note">${quantity(l.returned_milli)} ${esc(l.unit)} returned</small>` : ''}</td><td>${quantity(l.quantity_milli)} ${esc(l.unit)}</td><td>${money(l.price_cents)}</td><td>${money(l.discount_cents)}</td><td>${money(l.tax_cents)}</td><td>${money(l.total_cents)}</td></tr>`,
        ),
      )}<div class="document-total"><p>Subtotal ${money(p.subtotal_cents)} · Tax ${money(p.tax_cents)}</p><strong>${money(p.total_cents)}</strong>${Number(p.returned_cents) ? `<small>Items returned ${money(p.returned_cents)}${Number(p.refunded_cents) ? ' · refunded ' + money(p.refunded_cents) : ''}</small>` : ''}${p.kind === 'PurchaseOrder' ? '<small>Order value · billed on each delivery receipt</small>' : ''}<small ${p.kind === 'PurchaseOrder' ? 'hidden' : ''}>Paid ${money(p.paid_cents)} · ${p.status === 'Returned' ? 'Returned' : `Balance ${money(p.total_cents - p.paid_cents - Number(p.returned_cents || 0) + Number(p.refunded_cents || 0))}`}</small></div>${p.notes ? `<p class="tiny muted" style="margin-top:20px">${esc(p.notes)}</p>` : ''}<p class="doc-footer">${p.kind === 'PurchaseOrder' ? 'Please quote this order number on your delivery note and invoice.' : esc(state.boot.settings.invoice_footer || 'Thank you for your business.')}</p></article>`}${p.kind === 'PurchaseOrder' && d.receipts.length ? `<div class="section-label">Deliveries received</div>${table(['Receipt', 'Date', 'Value'], d.receipts.map(r => `<tr><td><button class="subtle" onclick="documentDetail(${r.id})">${esc(r.number)}</button></td><td>${date(r.created_at)}</td><td>${money(r.total_cents)}</td></tr>`))}` : ''}${invoiceCostView(d)}<div class="form-actions"><button class="secondary" onclick="window.print()">Print A4 / save PDF</button>${['Sale', 'Invoice', 'Return'].includes(p.kind) ? `<button class="secondary" onclick="printReceipt(${id})">Print receipt · 80 mm</button>` : ''}${can('manager', 'accountant') && p.status === 'Draft' && p.kind === 'Quotation' ? `<button class="secondary" onclick="quotationAction(${id},'decline')">Decline</button><button class="secondary" onclick="quotationAction(${id},'accept')">Accept quotation</button>` : ''}${p.kind === 'Purchase' && p.status === 'Posted' && can('manager', 'warehouse') && d.lines.some(l => Number(l.quantity_milli) > Number(l.returned_milli || 0)) ? `<button class="secondary" onclick="supplierReturnDialog(${id})">Return to supplier</button>` : ''}${p.kind === 'PurchaseOrder' && ['Ordered', 'Partially received'].includes(p.status) ? `${can('manager', 'accountant') ? `<button class="secondary" onclick="closeOrder(${id})">${p.status === 'Ordered' ? 'Cancel order' : 'Close · stop waiting for the rest'}</button>` : ''}${can('manager', 'warehouse') ? `<button class="primary" onclick="receiveOrderDialog(${id})">Receive goods →</button>` : ''}` : ''}${can('manager', 'accountant') && ['Draft', 'Accepted'].includes(p.status) && p.kind === 'Quotation' ? `<button class="primary" onclick="convertQuotation(${id})">Convert to invoice →</button>` : ''}${can('manager', 'accountant') && p.status === 'Posted' && p.kind !== 'Return' ? `${p.paid_cents < p.total_cents ? `<button class="primary" onclick="paymentDialog(${id},${p.total_cents - p.paid_cents})">Record payment</button>` : ''}${['Sale', 'Invoice'].includes(p.kind) && d.lines.some(l => Number(l.quantity_milli) > Number(l.returned_milli || 0)) ? `<button class="secondary" onclick="partialReturnDialog(${id})">Return items</button>` : ''}${['Sale', 'Invoice'].includes(p.kind) && !Number(p.returned_cents) ? `<button class="danger" onclick="returnDialog(${id})">Full return</button>` : ''}` : ''}</div>`,
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

/** Return some of the items on a sale or invoice. */
async function partialReturnDialog(id) {
  const d = await api('documents/' + id);
  const p = d.document;
  const open = d.lines.filter(l => Number(l.quantity_milli) > Number(l.returned_milli || 0));
  const netTotal = p.total_cents - Number(p.returned_cents || 0);
  const netPaid = p.paid_cents - Number(p.refunded_cents || 0);
  modal(
    'Return items · ' + p.number,
    `<form><div class="notice">Enter how many of each item came back. The refund is only what the customer paid beyond the new total; on unpaid invoices the return lowers the balance instead.</div>
    ${table(
      ['Item', 'Sold', 'Already returned', 'Return now'],
      open.map(
        l =>
          `<tr><td>${esc(l.name)}<small>${money(l.price_cents)} / ${esc(l.unit)}</small></td><td>${quantity(l.quantity_milli)}</td><td>${quantity(l.returned_milli || 0)}</td><td><input class="return-qty" data-line="${l.id}" data-max="${l.quantity_milli - (l.returned_milli || 0)}" data-sub="${l.subtotal_cents}" data-tax="${l.tax_cents}" data-qty="${l.quantity_milli}" inputmode="decimal" value="0" aria-label="Quantity of ${esc(l.name)} to return"></td></tr>`,
      ),
    )}
    <div class="form-grid"><label>Returned stock condition<select name="condition">${selectOptions(['Restock', 'Do not restock'])}</select></label><label>Refund paid back by<select name="refund_method">${selectOptions(['Cash', 'Card', 'Bank'], p.method === 'Card' || p.method === 'Bank' ? p.method : 'Cash')}</select></label></div>
    <div class="checkout-summary" id="return-summary"></div>${formActions('Record return')}</form>`,
    true,
  );
  const summarise = () => {
    let value = 0;
    document.querySelectorAll('.return-qty').forEach(input => {
      const q = Math.round(Number(input.value || 0) * 1000);
      value += Math.round(((Number(input.dataset.sub) + Number(input.dataset.tax)) * q) / Number(input.dataset.qty));
    });
    const refund = Math.max(0, netPaid - (netTotal - value));
    $('#return-summary').innerHTML = `<span>Returned value ${money(value)}</span><b class="${refund ? 'due' : 'ok'}">${refund ? 'Refund ' + money(refund) : 'No refund · balance reduced'}</b>`;
  };
  document.querySelectorAll('.return-qty').forEach(i => i.addEventListener('input', summarise));
  summarise();
  bindForm(async (fd, key) => {
    const lines = [...document.querySelectorAll('.return-qty')]
      .map(i => ({ line_id: Number(i.dataset.line), quantity: String(i.value || '0').trim() }))
      .filter(l => Number(l.quantity) > 0);
    if (!lines.length) throw new Error('Enter a quantity for at least one item.');
    const r = await api('documents/' + id, 'POST', { action: 'return', condition: fd.get('condition'), refund_method: fd.get('refund_method'), lines }, key);
    closeModal();
    toast(`${r.number} recorded · ${r.refund_cents ? 'refund ' + money(r.refund_cents) + ' by ' + r.refund_method : 'balance reduced by ' + money(r.returned_cents)}`);
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


/** Narrow receipt for 80 mm thermal printers, opened in its own window. */
async function printReceipt(id) {
  const d = await api('documents/' + id);
  const p = d.document;
  const snapshot = p.seller_snapshot ? (typeof p.seller_snapshot === 'string' ? JSON.parse(p.seller_snapshot) : p.seller_snapshot) : state.boot.settings;
  const logo = state.boot.settings.logo_path ? `<img src="${location.origin}${logoUrl()}" alt="" class="logo">` : '';
  const lines = d.lines
    .map(l => `<tr><td colspan="2">${esc(l.name)}</td></tr>${l.name_ar ? `<tr><td colspan="2" dir="rtl">${esc(l.name_ar)}</td></tr>` : ''}<tr class="sub"><td>${quantity(l.quantity_milli)} ${esc(l.unit)} × ${money(l.price_cents)}${Number(l.discount_cents) ? '<br>Discount / خصم −' + money(l.discount_cents) : ''}</td><td class="r">${money(l.total_cents)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.number)}</title><style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { font: 12px/1.35 ui-monospace, Menlo, Consolas, monospace; color: #000; margin: 0; width: 72mm; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
    .logo { max-width: 40mm; max-height: 18mm; display: block; margin: 0 auto 4px; }
    h1 { font-size: 15px; margin: 2px 0; } p { margin: 2px 0; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { padding: 1px 0; vertical-align: top; }
    tr.sub td { padding-bottom: 4px; }
    .total td { font-size: 15px; font-weight: 700; padding-top: 4px; }
  </style></head><body>
    <div class="c">${logo}<h1>${esc(snapshot.company_name)}</h1>${snapshot.company_name_ar ? `<h1 dir="rtl">${esc(snapshot.company_name_ar)}</h1>` : ''}<p>${esc(snapshot.address || '')}</p><p>${esc(snapshot.phone || '')}</p>${snapshot.tax_id ? `<p>TRN / الرقم الضريبي: ${esc(snapshot.tax_id)}</p>` : ''}</div>
    <hr><p class="c"><b>${String(snapshot.vat_registered ?? state.boot.settings.vat_registered) === '1' ? (p.kind === 'Return' ? 'TAX CREDIT NOTE<br>إشعار دائن ضريبي' : 'SIMPLIFIED TAX INVOICE<br>فاتورة ضريبية مبسطة') : (p.kind === 'Return' ? 'CREDIT NOTE<br>إشعار دائن' : 'RECEIPT<br>إيصال')}</b></p><p>No. / رقم: ${esc(p.number)}</p><p>${new Date(p.created_at).toLocaleString('en')}</p>${d.contact ? `<p>Customer: ${esc(d.contact.name)}</p>` : ''}<hr>
    <table>${lines}</table><hr>
    <table><tr><td>Subtotal / المجموع</td><td class="r">${money(p.subtotal_cents)}</td></tr><tr><td>VAT / الضريبة</td><td class="r">${money(p.tax_cents)}</td></tr><tr class="total"><td>TOTAL / الإجمالي</td><td class="r">${money(p.total_cents)}</td></tr>${(d.payments || []).map(pay => `<tr><td>Paid / مدفوع · ${esc(pay.method)}</td><td class="r">${money(pay.amount_cents)}</td></tr>`).join('') || `<tr><td>Paid</td><td class="r">${money(p.paid_cents)}</td></tr>`}${p.tendered_cents ? `<tr><td>Cash received / النقد المستلم</td><td class="r">${money(p.tendered_cents)}</td></tr><tr><td><b>Change / الباقي</b></td><td class="r"><b>${money(p.change_cents)}</b></td></tr>` : ''}${p.total_cents > p.paid_cents ? `<tr><td>Balance due / الرصيد</td><td class="r">${money(p.total_cents - p.paid_cents)}</td></tr>` : ''}</table>
    ${d.loyalty ? `<hr><p>Points earned / نقاط مكتسبة: ${d.loyalty.earned}${d.loyalty.redeemed ? `<br>Points used / نقاط مستخدمة: ${d.loyalty.redeemed}` : ''}<br>Points balance / رصيد النقاط: <b>${d.loyalty.balance}</b></p>` : ''}
    <hr><p class="c">${esc(state.boot.settings.invoice_footer || 'Thank you for your visit.')}</p><p class="c" dir="rtl">شكرًا لزيارتكم</p>
    <script>window.addEventListener('load', () => { window.print(); });<\/script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=420,height=720');
  if (!w) {
    toast('Allow pop-ups for this site to print receipts.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();

}


async function convertQuotation(id) {
  if (!confirm('Create an invoice from this quotation? Stock is deducted when the invoice is posted.')) return;
  try {
    const r = await api('documents/' + id, 'POST', { action: 'convert' });
    toast(r.number + ' created from the quotation');
    if (location.hash === '#wholesale') await render();
    await documentDetail(r.id);
  } catch (e) {
    toast(e.message);
  }
}


/** Receive some or all outstanding items of a purchase order. */
async function receiveOrderDialog(id) {
  const d = await api('documents/' + id);
  const p = d.document;
  const open = d.lines.filter(l => Number(l.quantity_milli) > Number(l.received_milli || 0));
  modal(
    'Receive goods · ' + p.number,
    `<form><div class="notice">Enter what actually arrived. Anything not received stays open on the order for a later delivery.</div>
    ${table(
      ['Item', 'Ordered', 'Received before', 'Receiving now', 'Expiry (optional)'],
      open.map(
        l =>
          `<tr><td>${esc(l.name)}<small>${money(l.price_cents)} / ${esc(l.unit)}</small></td><td>${quantity(l.quantity_milli)} ${esc(l.unit)}</td><td>${quantity(l.received_milli || 0)}</td><td><input class="receive-qty" data-line="${l.id}" inputmode="decimal" value="${(Number(l.quantity_milli) - Number(l.received_milli || 0)) / 1000}" aria-label="Quantity of ${esc(l.name)} received"></td><td><input type="date" class="receive-expiry" aria-label="Expiry date of ${esc(l.name)}"></td></tr>`,
      ),
    )}
    <div class="form-grid"><label>Receive into<select name="location_id">${options(state.boot.locations, 'name', p.location_id)}</select></label>${field('Supplier delivery note / bill number', 'bill_reference', '')}</div>${formActions('Receive into stock')}</form>`,
    true,
  );
  bindForm(async (fd, key) => {
    const lines = [...document.querySelectorAll('.receive-qty')]
      .map(i => ({ line_id: Number(i.dataset.line), quantity: String(i.value || '0').trim(), expires_on: i.closest('tr').querySelector('.receive-expiry').value || null }))
      .filter(l => Number(l.quantity) > 0);
    if (!lines.length) throw new Error('Enter a quantity for at least one item.');
    const r = await api('documents/' + id, 'POST', { action: 'receive', location_id: Number(fd.get('location_id')), bill_reference: fd.get('bill_reference'), lines }, key);
    closeModal();
    toast(`${r.number} received · order ${r.order_status.toLowerCase()}`);
    await render();
    await documentDetail(id);
  });
}

async function closeOrder(id) {
  if (!confirm('Stop waiting for the remaining items on this order?')) return;
  try {
    const r = await api('documents/' + id, 'POST', { action: 'close' });
    toast('Order ' + r.status.toLowerCase());
    await render();
    await documentDetail(id);
  } catch (e) {
    toast(e.message);
  }
}


/** Send items from a purchase receipt back to the supplier. */
async function supplierReturnDialog(id) {
  const d = await api('documents/' + id);
  const p = d.document;
  const open = d.lines.filter(l => Number(l.quantity_milli) > Number(l.returned_milli || 0));
  const netTotal = p.total_cents - Number(p.returned_cents || 0);
  const netPaid = p.paid_cents - Number(p.refunded_cents || 0);
  modal(
    'Return to supplier · ' + p.number,
    `<form><div class="notice">Stock leaves lot ${esc(p.number)} at ${esc(state.boot.locations.find(l => l.id === p.location_id)?.name || 'the receiving location')}. What you owe the supplier goes down; if you already paid more than the new total, record how the supplier refunds you.</div>
    ${table(
      ['Item', 'Received', 'Already returned', 'Send back now'],
      open.map(
        l =>
          `<tr><td>${esc(l.name)}<small>${money(l.price_cents)} / ${esc(l.unit)}</small></td><td>${quantity(l.quantity_milli)} ${esc(l.unit)}</td><td>${quantity(l.returned_milli || 0)}</td><td><input class="return-qty" data-line="${l.id}" data-sub="${l.subtotal_cents}" data-tax="${l.tax_cents}" data-qty="${l.quantity_milli}" inputmode="decimal" value="0" aria-label="Quantity of ${esc(l.name)} to send back"></td></tr>`,
      ),
    )}
    <div class="form-grid"><label>Reason · damaged, wrong item, expired…<input name="reason" maxlength="300"></label><label>Supplier refunds by<select name="refund_method">${selectOptions(['Bank', 'Cash', 'Card'], 'Bank')}</select></label></div>
    <div class="checkout-summary" id="return-summary"></div>${formActions('Record supplier return')}</form>`,
    true,
  );
  const summarise = () => {
    let value = 0;
    document.querySelectorAll('.return-qty').forEach(input => {
      value += Math.round(((Number(input.dataset.sub) + Number(input.dataset.tax)) * Math.round(Number(input.value || 0) * 1000)) / Number(input.dataset.qty));
    });
    const refund = Math.max(0, netPaid - (netTotal - value));
    $('#return-summary').innerHTML = `<span>Returned value ${money(value)}</span><b class="${refund ? 'due' : 'ok'}">${refund ? 'Supplier refunds ' + money(refund) : 'Amount owed to supplier reduced'}</b>`;
  };
  document.querySelectorAll('.return-qty').forEach(i => i.addEventListener('input', summarise));
  summarise();
  bindForm(async (fd, key) => {
    const lines = [...document.querySelectorAll('.return-qty')].map(i => ({ line_id: Number(i.dataset.line), quantity: String(i.value || '0').trim() })).filter(l => Number(l.quantity) > 0);
    if (!lines.length) throw new Error('Enter a quantity for at least one item.');
    const r = await api('documents/' + id, 'POST', { action: 'supplier_return', reason: fd.get('reason'), refund_method: fd.get('refund_method'), lines }, key);
    closeModal();
    toast(`${r.number} recorded · ${r.refund_cents ? 'supplier refunds ' + money(r.refund_cents) : 'payable reduced by ' + money(r.returned_cents)}`);
    await render();
    await documentDetail(id);
  });
}


/* ── UAE tax invoice: English first, Arabic second ─────────────────────────── */

/** Bilingual label: English, then Arabic underneath. */
function bi(en, ar) {
  return `<span class="bi"><span class="bi-en">${en}</span><span class="bi-ar" lang="ar" dir="rtl">${ar}</span></span>`;
}

function docTitle(kind, vat) {
  if (kind === 'Quotation') return ['QUOTATION', 'عرض سعر'];
  if (kind === 'Return') return vat ? ['TAX CREDIT NOTE', 'إشعار دائن ضريبي'] : ['CREDIT NOTE', 'إشعار دائن'];
  return vat ? ['TAX INVOICE', 'فاتورة ضريبية'] : ['INVOICE', 'فاتورة'];
}

/** Links to related documents, shown on screen only. */
function relatedLinks(d) {
  const links = [];
  if (d.original) links.push(`Return of <button class="subtle" onclick="documentDetail(${d.original.id})">${esc(d.original.number)}</button>`);
  if (d.quotation) links.push(`From quotation <button class="subtle" onclick="documentDetail(${d.quotation.id})">${esc(d.quotation.number)}</button>`);
  if (d.invoice) links.push(`Invoiced as <button class="subtle" onclick="documentDetail(${d.invoice.id})">${esc(d.invoice.number)}</button>`);
  return links.length ? `<p class="related-links dossier-actions">${links.join(' · ')}</p>` : '';
}

function taxInvoiceMarkup(d, s) {
  const p = d.document;
  const vat = String(s.vat_registered ?? state.boot.settings.vat_registered) === '1';
  const [titleEn, titleAr] = docTitle(p.kind, vat);
  const c = d.contact || {};
  const currency = esc(s.currency || 'AED');
  const rates = {};
  d.lines.forEach(l => {
    const r = (rates[l.tax_bp] ||= { net: 0, tax: 0 });
    r.net += Number(l.subtotal_cents);
    r.tax += Number(l.tax_cents);
  });
  const balance = p.total_cents - p.paid_cents - Number(p.returned_cents || 0) + Number(p.refunded_cents || 0);
  const row = (en, ar, value, cls = '') => `<tr class="${cls}"><th>${bi(en, ar)}</th><td>${value}</td></tr>`;
  return `<article class="document-preview tax-invoice" data-no-translate>
    <header class="ti-head">
      <div class="ti-seller">
        ${state.boot.settings.logo_path ? `<img class="doc-logo" src="${logoUrl()}" alt="">` : ''}
        <b class="ti-company">${esc(s.company_name)}</b>${s.company_name_ar ? `<b class="ti-company" lang="ar" dir="rtl">${esc(s.company_name_ar)}</b>` : ''}
        <small>${esc(s.address || '')}</small>${s.address_ar ? `<small lang="ar" dir="rtl">${esc(s.address_ar)}</small>` : ''}
        <small>${[s.phone, s.email].filter(Boolean).map(esc).join(' · ')}</small>
        ${s.tax_id ? `<small class="ti-trn">TRN · الرقم الضريبي: <b>${esc(s.tax_id)}</b></small>` : ''}
      </div>
      <div class="ti-title"><h1>${titleEn}</h1><h2 lang="ar" dir="rtl">${titleAr}</h2>${badge(p.status)}</div>
    </header>
    <section class="ti-meta">
      <div class="ti-billto"><small>${bi('Bill to', 'العميل')}</small><b>${esc(c.name || 'Walk-in customer')}</b>${c.name === undefined || c.name ? '' : ''}<small>${esc(c.address || '')}</small><small>${[c.phone, c.email].filter(Boolean).map(esc).join(' · ')}</small>${c.tax_id ? `<small class="ti-trn">TRN · الرقم الضريبي: <b>${esc(c.tax_id)}</b></small>` : ''}</div>
      <table class="ti-facts">
        ${row(p.kind === 'Quotation' ? 'Quotation no.' : p.kind === 'Return' ? 'Credit note no.' : 'Invoice no.', p.kind === 'Quotation' ? 'رقم العرض' : p.kind === 'Return' ? 'رقم الإشعار' : 'رقم الفاتورة', `<b>${esc(p.number)}</b>`)}
        ${row('Date of issue', 'تاريخ الإصدار', date(p.created_at))}
        ${p.due_date ? row(p.kind === 'Quotation' ? 'Valid until' : 'Due date', p.kind === 'Quotation' ? 'صالح حتى' : 'تاريخ الاستحقاق', date(p.due_date)) : ''}
        ${p.bill_reference ? row('Reference', 'المرجع', esc(p.bill_reference)) : ''}
        ${d.original ? row('Original invoice', 'الفاتورة الأصلية', esc(d.original.number)) : ''}
        ${p.kind !== 'Quotation' ? row('Payment', 'الدفع', (d.payments || []).length ? d.payments.map(x => `${esc(x.method)} ${money(x.amount_cents)}`).join('<br>') : esc(p.method)) : ''}
      </table>
    </section>
    <table class="ti-lines">
      <thead><tr><th>#</th><th>${bi('Description', 'الوصف')}</th><th>${bi('Qty', 'الكمية')}</th><th>${bi('Unit price', 'سعر الوحدة')}</th><th>${bi('Discount', 'الخصم')}</th><th>${bi('Taxable amount', 'المبلغ الخاضع')}</th><th>${bi('VAT %', 'نسبة الضريبة')}</th><th>${bi('VAT', 'الضريبة')}</th><th>${bi('Total', 'الإجمالي')}</th></tr></thead>
      <tbody>${d.lines
        .map(
          (l, i) =>
            `<tr><td>${i + 1}</td><td><b>${esc(l.name)}</b>${l.name_ar ? `<span class="ti-ar" lang="ar" dir="rtl">${esc(l.name_ar)}</span>` : ''}${Number(l.returned_milli) ? `<small class="returned-note">${quantity(l.returned_milli)} ${esc(l.unit)} returned · مُرتجع</small>` : ''}</td><td>${quantity(l.quantity_milli)} ${esc(l.unit)}</td><td>${money(l.price_cents)}</td><td>${Number(l.discount_cents) ? money(l.discount_cents) : '—'}</td><td>${money(l.subtotal_cents)}</td><td>${(Number(l.tax_bp) / 100).toFixed(2).replace(/\.00$/, '')}%</td><td>${money(l.tax_cents)}</td><td>${money(l.total_cents)}</td></tr>`,
        )
        .join('')}</tbody>
    </table>
    <section class="ti-bottom">
      ${vat ? `<table class="ti-vat"><thead><tr><th>${bi('VAT rate', 'نسبة الضريبة')}</th><th>${bi('Taxable amount', 'المبلغ الخاضع')}</th><th>${bi('VAT amount', 'مبلغ الضريبة')}</th></tr></thead><tbody>${Object.entries(rates)
        .map(([bp, r]) => `<tr><td>${(Number(bp) / 100).toFixed(2).replace(/\.00$/, '')}%</td><td>${money(r.net)}</td><td>${money(r.tax)}</td></tr>`)
        .join('')}</tbody></table>` : '<div></div>'}
      <table class="ti-totals">
        ${row('Total excluding VAT', 'الإجمالي قبل الضريبة', money(p.subtotal_cents))}
        ${row('VAT', 'ضريبة القيمة المضافة', money(p.tax_cents))}
        ${row(`Total including VAT (${currency})`, `الإجمالي شامل الضريبة (${currency})`, `<b>${money(p.total_cents)}</b>`, 'grand')}
        ${Number(p.returned_cents) ? row('Items returned', 'أصناف مرتجعة', '−' + money(p.returned_cents)) : ''}
        ${p.kind !== 'Quotation' && p.kind !== 'Return' ? row('Paid', 'المدفوع', money(p.paid_cents - Number(p.refunded_cents || 0))) + row('Balance due', 'الرصيد المستحق', `<b>${money(Math.max(0, balance))}</b>`) : ''}
        ${p.tendered_cents ? row('Cash received / change', 'النقد المستلم / الباقي', `${money(p.tendered_cents)} / ${money(p.change_cents)}`) : ''}
      </table>
    </section>
    ${p.notes ? `<p class="ti-notes">${esc(p.notes)}</p>` : ''}
    <p class="doc-footer">${esc(state.boot.settings.invoice_footer || 'Thank you for your business.')}<br><span lang="ar" dir="rtl">شكرًا لتعاملكم معنا.</span></p>
  </article>`;
}


/* ── Customer price lists ──────────────────────────────────────────────── */

/** Price for the customer chosen in the document form: their special price, else the list price. */
function customerPrice(p) {
  if (!p) return 0;
  const special = state.docPricing?.prices.find(x => x.product_id === p.id);
  return special ? special.price_cents : p.price_cents;
}

/** Fill the line discount from the customer's standard discount, unless typed by hand or a special price applies. */
function applyCustomerDiscount(line) {
  const input = line.querySelector('[data-discount]');
  if (input.dataset.auto === '0' || !state.docPricing) return;
  const id = Number(line.querySelector('[data-product]').value);
  const special = state.docPricing.prices.some(x => x.product_id === id);
  const gross = Math.round(Number(line.querySelector('[data-qty]').value || 0) * toCentsValue(line.querySelector('[data-price]').value));
  input.value = decimal(special ? 0 : Math.round((gross * state.docPricing.discount_bp) / 10000));
  input.dataset.auto = '1';
}

function toCentsValue(v) {
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Load the chosen customer's pricing and re-price every line in the open document form. */
async function useCustomerPricing(contactId, kind) {
  state.docPricing = contactId && ['Invoice', 'Quotation'].includes(kind) ? await api(`contacts/${contactId}/pricing`) : null;
  const note = $('#pricing-note');
  if (note) note.textContent = state.docPricing && (state.docPricing.discount_bp || state.docPricing.prices.length) ? `Customer pricing applied: ${state.docPricing.discount_bp ? (state.docPricing.discount_bp / 100).toFixed(2).replace(/\.00$/, '') + '% discount' : ''}${state.docPricing.discount_bp && state.docPricing.prices.length ? ' · ' : ''}${state.docPricing.prices.length ? state.docPricing.prices.length + ' special price(s)' : ''}` : '';
  document.querySelectorAll('#doc-lines .line-editor').forEach(line => {
    const p = state.docProducts.find(x => x.id === Number(line.querySelector('[data-product]').value));
    if (p) line.querySelector('[data-price]').value = decimal(customerPrice(p));
    line.querySelector('[data-discount]').dataset.auto = '1';
    applyCustomerDiscount(line);
  });
  draftTotal();
}

async function priceListDialog(id) {
  const c = state.contacts.find(x => x.id === id);
  const d = await api(`contacts/${id}/pricing`);
  const sellable = state.products.filter(p => p.active && p.sales_allowed);
  const row = (productId = '', price = '') => `<div class="line-editor price-row"><select data-product required>${options(sellable, 'name', productId)}</select><input data-price aria-label="Special price" inputmode="decimal" value="${price}"><small class="muted list-price"></small><button type="button" class="remove" aria-label="Remove">×</button></div>`;
  modal(
    'Price list · ' + c.name,
    `<form><div class="notice">Applied automatically on quotations, invoices and POS sales for this customer. A special price replaces the list price and gets no extra discount; other products get the standard discount.</div>
    <label>Standard discount %<input name="discount" inputmode="decimal" value="${(d.discount_bp / 100).toFixed(2)}"></label>
    <div class="section-label">Special prices · excluding VAT</div><div id="price-rows">${d.prices.map(x => row(x.product_id, decimal(x.price_cents))).join('')}</div>
    <button type="button" class="secondary" id="add-price">+ Add special price</button>${formActions('Save price list')}</form>`,
    true,
  );
  const wire = el => {
    const show = () => {
      const p = sellable.find(x => x.id === Number(el.querySelector('[data-product]').value));
      el.querySelector('.list-price').textContent = p ? 'List ' + money(p.price_cents) : '';
    };
    el.querySelector('[data-product]').addEventListener('change', show);
    el.querySelector('.remove').addEventListener('click', () => el.remove());
    show();
  };
  document.querySelectorAll('.price-row').forEach(wire);
  $('#add-price').addEventListener('click', () => {
    $('#price-rows').insertAdjacentHTML('beforeend', row());
    wire($('#price-rows').lastElementChild);
  });
  bindForm(async fd => {
    const prices = [...document.querySelectorAll('.price-row')].map(el => ({ product_id: Number(el.querySelector('[data-product]').value), price: el.querySelector('[data-price]').value.trim() }));
    await api(`contacts/${id}/pricing`, 'POST', { discount: fd.get('discount') || '0', prices });
    state.contacts = (await api('contacts')).contacts;
    closeModal();
    toast('Price list saved');
  });
}


/* ── Reorder suggestions ───────────────────────────────────────────────── */

function reorderPanel(groups) {
  state.reorder = groups;
  const suppliers = state.contacts.filter(c => c.kind === 'supplier');
  return panel(
    'Reorder suggestions',
    `<div class="panel-body"><p class="muted">Stock plus open orders is at or below the reorder level. Suggested quantities top stock up to twice the reorder level; change them before ordering.</p>${groups
      .map(
        (g, gi) => `<div class="reorder-group" data-group="${gi}"><div class="reorder-head">${g.supplier_id ? `<b>${esc(g.supplier)}</b><small>Last supplier</small>` : `<label>Supplier<select data-supplier>${options(suppliers, 'name', '', 'Choose a supplier…')}</select></label>`}<button class="primary" onclick="createReorder(${gi})">Create purchase order →</button></div>
        ${table(
          ['Product', 'In stock', 'On order', 'Reorder level', 'Last cost', 'Order quantity'],
          g.items.map(i => `<tr><td><b>${esc(i.name)}</b><small>${esc(i.sku)}</small></td><td>${quantity(i.stock_milli)} ${esc(i.unit)}</td><td>${quantity(i.on_order_milli)}</td><td>${quantity(i.reorder_milli)}</td><td>${money(i.last_cost_cents)}</td><td><input class="reorder-qty" data-product="${i.product_id}" data-cost="${i.last_cost_cents}" inputmode="decimal" value="${i.suggested_milli / 1000}" aria-label="Quantity of ${esc(i.name)} to order"></td></tr>`),
        )}</div>`,
      )
      .join('')}</div>`,
  );
}

async function createReorder(index) {
  const box = document.querySelector(`.reorder-group[data-group="${index}"]`);
  const g = state.reorder[index];
  const supplier = g.supplier_id || Number(box.querySelector('[data-supplier]')?.value);
  if (!supplier) return toast('Choose a supplier first.');
  const lines = [...box.querySelectorAll('.reorder-qty')].filter(i => Number(i.value) > 0).map(i => ({ product_id: Number(i.dataset.product), quantity: i.value.trim(), price: decimal(Number(i.dataset.cost)) }));
  if (!lines.length) return toast('Enter a quantity for at least one product.');
  try {
    const r = await api('documents', 'POST', { kind: 'PurchaseOrder', contact_id: supplier, location_id: state.location, method: 'Credit', paid: '0', lines });
    toast(r.number + ' ordered');
    await render();
    await documentDetail(r.id);
  } catch (e) {
    toast(e.message);
  }
}
