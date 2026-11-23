/* Atelier Perfume ERP · Customer 360 and product 360 records and printing. */
'use strict';

async function customersPage() {
  await loadLists();
  const customers = state.contacts.filter(c => c.kind === 'customer');
  $('#content').innerHTML =
    pageHead(
      'Customer 360',
      'Products, artwork, manufacturing and invoices in one record.',
      `<button class="primary" onclick="contactCreate('customer')">+ Add customer</button>`,
    ) +
    `<div class="customer-cards">${customers.map(c => `<article class="customer-card"><div class="customer-monogram">${esc(c.name[0])}</div><h2>${esc(c.name)}</h2><p>${esc(c.phone || c.email || 'Contact details not recorded')}</p><button class="primary" onclick="customer360(${c.id})">Open 360 view</button></article>`).join('') || '<div class="empty">Add your first customer.</div>'}</div>`;
}

async function customer360(id) {
  if (location.hash !== '#customers') {
    location.hash = 'customers';
    return setTimeout(() => customer360(id), 250);
  }
  try {
    const d = await api('customers/' + id + '/360');
    state.customerDossier = d;
    state.currentCustomer = id;
    const posted = d.documents.filter(i => ['Sale', 'Invoice'].includes(i.kind) && i.status === 'Posted'),
      rev = posted.reduce((n, i) => n + i.subtotal_cents - (i.returned_subtotal_cents || 0), 0),
      balance = posted.reduce((n, i) => n + i.total_cents - i.paid_cents - (i.returned_cents || 0) + (i.refunded_cents || 0), 0);
    const counts = ['Artwork approved', 'Production complete', 'Packaging ready', 'Delivered'].map((name, index) => ({
      name,
      value: d.projects.filter(p =>
        index === 0
          ? p.approved_artwork_id
          : index === 1
            ? p.batch?.status === 'Completed'
            : (p.workflow_events || []).some(e => e.stage === (index === 2 ? 'packaging_ready' : 'delivered')),
      ).length,
    }));
    $('#content').innerHTML =
      pageHead(
        d.customer.name,
        'Customer 360 · internal company record',
        `${can('manager', 'accountant') ? `<button class="secondary" onclick="statementDialog(${id})">Statement</button>` : ''}<button class="secondary" onclick="customerProfileDialog(${id})">Edit profile / phone</button><button class="secondary" onclick="customersPage()">Customer list</button><button class="primary" onclick="printCustomer360()">Print 360 record</button>`,
      ) +
      `<div class="dossier-sheet"><p class="customer-contact">${esc(d.customer.phone || '')} ${esc(d.customer.email || '')}<br>${esc(d.customer.address || '')}</p><div class="stats">${reportStat('Linked products', d.products.length, 'From projects and invoices')}${reportStat('Projects', d.projects.length, 'Design and packaging')}${reportStat('Sales excluding tax', money(rev), 'Active posted invoices')}${reportStat('Outstanding', money(balance), 'Customer balance')}</div><section class="panel"><div class="panel-head"><h2>Products</h2></div><div class="panel-body"><div class="catalogue">${d.products.map(p => `<article class="product-card" onclick="product360(${p.id})">${productArt(p)}<div class="product-info"><h3>${esc(p.name)}</h3><p>${esc(p.size || p.sku)}</p><button class="subtle">Open full product record</button></div></article>`).join('') || '<p>Link a product to a customer project or create an invoice to build this record.</p>'}</div></div></section><section class="panel"><div class="panel-head"><h2>Order progress</h2></div><div class="panel-body progress-chart">${counts.map(c => `<div><span>${esc(c.name)}</span><div><i style="width:${d.projects.length ? (c.value / d.projects.length) * 100 : 0}%"></i></div><b>${c.value} / ${d.projects.length}</b></div>`).join('')}</div></section>${d.projects.map(project360Panel).join('')}${panel(
        'Invoices and quotations',
        table(
          ['Document', 'Type', 'Status', 'Total', 'Paid'],
          d.documents.map(
            i =>
              `<tr><td><button class="subtle dossier-actions" onclick="documentDetail(${i.id})">${esc(i.number)}</button><span class="print-only">${esc(i.number)}</span></td><td>${esc(i.kind)}</td><td>${esc(i.status)}</td><td>${money(i.total_cents)}</td><td>${money(i.paid_cents)}</td></tr>`,
          ),
        ),
      )}</div>`;
  } catch (e) {
    toast(e.message);
  }
}

async function printCustomer360() {
  try {
    toast('Preparing complete customer record…');
    const records = await Promise.all(state.customerDossier.products.map(p => api('products/' + p.id + '/360')));
    modal(
      state.customerDossier.customer.name + ' · 360 record',
      `<article class="document-preview"><h1>${esc(state.customerDossier.customer.name)}</h1><p>Confidential internal record · ${new Date().toLocaleDateString('en')}</p>${$('.dossier-sheet').innerHTML}</article>${records.map(productRecordMarkup).join('')}<div class="form-actions"><button class="primary" onclick="window.print()">Print / save complete PDF</button></div>`,
      true,
    );
  } catch (e) {
    toast(e.message);
  }
}

async function product360(id) {
  try {
    const d = await api('products/' + id + '/360');
    modal(d.product.name + ' · complete product record', productRecordMarkup(d), true);
  } catch (e) {
    toast(e.message);
  }
}

function productRecordMarkup(d) {
  const p = d.product;
  return `<article class="document-preview product-dossier"><p class="eyebrow">Confidential internal product record</p><h1>${esc(p.name)}</h1><p>${esc(p.sku)} · ${esc(p.concentration || p.kind)} · ${esc(p.size || p.unit)} · ${esc(p.origin || 'Origin not recorded')}</p><div class="dossier-product-images">${p.images?.length ? p.images.map(i => `<img src="${i.url}" alt="${esc(i.alt)}">`).join('') : ''}</div>${fragranceProfileView(p)}${panel(
    'Formula versions',
    d.formulas
      .map(
        f =>
          `<div class="panel-body"><h3>${esc(f.name)} · v${f.version} · ${esc(f.status)}</h3><p>Maturation plan: ${f.maturation_days} days</p>${table(
            ['Ingredient / packaging', 'Quantity per bottle', 'Unit'],
            [...f.ingredients, ...f.packaging].map(
              i => `<tr><td>${esc(i.name)}</td><td>${quantity(i.quantity_milli)}</td><td>${esc(i.unit)}</td></tr>`,
            ),
          )}<p>${esc(f.instructions || '')}</p></div>`,
      )
      .join('') || '<div class="empty">No formula linked to this product.</div>',
  )}${panel('Production batches', d.batches.map(b => `<div class="panel-body"><h3>${esc(b.number)} · ${esc(b.status)}</h3><p>Planned ${b.planned} · Accepted ${b.accepted} · Rejected ${b.rejected}<br>Maturation due: ${date(b.matures_at)}</p>${costSheetView(b.costing?.actual || b.costing?.issued || b.costing?.estimate, 'Batch cost')}<p>Mixing: ${durationText(b.workflow_events || [], 'issue', 'mature')} · Maturation to QC: ${durationText(b.workflow_events || [], 'mature', 'qc')}</p><p>${esc(b.qc_notes || '')}</p></div>`).join('') || '<div class="empty">No production batches yet.</div>')}${d.projects.map(project360Panel).join('')}${panel(
    'Supplier purchase history',
    table(
      ['Supplier', 'Bill / reference', 'Date', 'Quantity', 'Price per unit', 'Total ex. tax'],
      d.purchases.map(
        i =>
          `<tr><td>${esc(i.supplier || 'Not recorded')}</td><td>${esc(i.number)}<small>${esc(i.bill_reference || '')}</small></td><td>${date(i.created_at)}</td><td>${quantity(i.quantity_milli)} ${esc(p.unit)}</td><td>${money(i.price_cents)}</td><td>${money(i.subtotal_cents)}</td></tr>`,
      ),
    ),
  )}</article><div class="form-actions"><button class="primary" onclick="window.print()">Print / save product PDF</button></div>`;
}
