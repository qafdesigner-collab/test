/* Atelier Perfume ERP · Reports and profitability. */
'use strict';

async function reportsPage() {
  const [r, ageing] = await Promise.all([api('profitability'), api('receivables')]);
  const value = n => (n === null ? 'Not recorded' : money(n));
  $('#content').innerHTML =
    pageHead(
      'Purchases, sales & profit',
      'Follow each product from supplier bill or production batch to its sale.',
      `<a class="secondary" href="/api/export?type=stock">Stock CSV</a><a class="primary" href="/api/export?type=profit">Profit CSV</a>`,
    ) +
    receivablesPanel(ageing) +
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


const AGE_BUCKETS = [
  ['current', 'Not yet due', 'غير مستحق بعد'],
  ['days_1_30', '1–30 days', '1–30 يومًا'],
  ['days_31_60', '31–60 days', '31–60 يومًا'],
  ['days_61_90', '61–90 days', '61–90 يومًا'],
  ['days_over_90', 'Over 90 days', 'أكثر من 90 يومًا'],
];

/** Who owes what, by how late it is. */
function receivablesPanel(a) {
  const t = a.totals;
  const cell = (v, late) => (v ? `<span class="${late ? 'overdue' : ''}">${money(v)}</span>` : '<span class="muted">—</span>');
  return panel(
    'Receivables ageing · amounts customers owe',
    `<div class="ageing-strip">${AGE_BUCKETS.map(([k, en], i) => `<div class="${i && t[k] ? 'late' : ''}"><small>${en}</small><b>${money(t[k])}</b></div>`).join('')}<div class="total"><small>Total owed</small><b>${money(t.balance_cents)}</b></div></div>` +
      table(
        ['Customer', 'Not yet due', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days', 'Total owed', ''],
        a.customers.map(c => `<tr><td><b>${esc(c.name)}</b><small>${c.documents} open document${c.documents === 1 ? '' : 's'}${c.oldest_days ? ` · oldest ${c.oldest_days} days late` : ''}</small></td>${AGE_BUCKETS.map(([k], i) => `<td>${cell(c[k], i > 0)}</td>`).join('')}<td><b>${money(c.balance_cents)}</b></td><td><button class="subtle" onclick="statementDialog(${c.contact_id})">Statement</button></td></tr>`),
        'No customer owes anything right now.',
      ),
  );
}

/** Printable customer statement, English first and Arabic second. */
async function statementDialog(id, from = '', to = '') {
  const s = await api(`customers/${id}/statement` + (from ? `?from=${from}&to=${to}` : ''));
  const co = state.boot.settings;
  const c = s.customer;
  const typeLabel = { Invoice: ['Invoice', 'فاتورة'], Sale: ['Sale', 'بيع'], Payment: ['Payment', 'دفعة'], Return: ['Return', 'إرجاع'], Refund: ['Refund', 'استرداد'] };
  modal(
    'Statement · ' + c.name,
    `<form class="statement-range dossier-actions"><label>From<input type="date" name="from" value="${s.from}"></label><label>To<input type="date" name="to" value="${s.to}"></label><button class="secondary" type="submit">Show</button></form>
    <article class="document-preview tax-invoice statement" data-no-translate>
      <header class="ti-head"><div class="ti-seller">${co.logo_path ? `<img class="doc-logo" src="${logoUrl()}" alt="">` : ''}<b class="ti-company">${esc(co.company_name)}</b>${co.company_name_ar ? `<b class="ti-company" lang="ar" dir="rtl">${esc(co.company_name_ar)}</b>` : ''}<small>${esc(co.address || '')}</small>${co.tax_id ? `<small class="ti-trn">TRN · الرقم الضريبي: <b>${esc(co.tax_id)}</b></small>` : ''}</div>
      <div class="ti-title"><h1>STATEMENT OF ACCOUNT</h1><h2 lang="ar" dir="rtl">كشف حساب</h2><small>${date(s.from)} – ${date(s.to)}</small></div></header>
      <section class="ti-meta"><div class="ti-billto"><small>${bi('Customer', 'العميل')}</small><b>${esc(c.name)}</b><small>${esc(c.address || '')}</small><small>${[c.phone, c.email].filter(Boolean).map(esc).join(' · ')}</small>${c.tax_id ? `<small class="ti-trn">TRN · الرقم الضريبي: <b>${esc(c.tax_id)}</b></small>` : ''}</div>
      <table class="ti-facts"><tr><th>${bi('Opening balance', 'الرصيد الافتتاحي')}</th><td>${money(s.opening_cents)}</td></tr><tr><th>${bi('Closing balance', 'الرصيد الختامي')}</th><td><b>${money(s.closing_cents)}</b></td></tr></table></section>
      <table class="ti-lines"><thead><tr><th>${bi('Date', 'التاريخ')}</th><th>${bi('Type', 'النوع')}</th><th>${bi('Document', 'المستند')}</th><th>${bi('Details', 'التفاصيل')}</th><th>${bi('Charges', 'مدين')}</th><th>${bi('Payments & credits', 'دائن')}</th><th>${bi('Balance', 'الرصيد')}</th></tr></thead>
      <tbody><tr><td>${date(s.from)}</td><td colspan="5"><b>${bi('Opening balance', 'الرصيد الافتتاحي')}</b></td><td>${money(s.opening_cents)}</td></tr>${s.lines
        .map(l => `<tr><td>${date(l.date)}</td><td>${bi(...(typeLabel[l.type] || [l.type, l.type]))}</td><td>${esc(l.number)}</td><td>${/^Due \d{4}-\d{2}-\d{2}$/.test(l.detail) ? 'Due · الاستحقاق ' + date(l.detail.slice(4)) : esc(l.detail)}</td><td>${l.debit ? money(l.debit) : ''}</td><td>${l.credit ? money(l.credit) : ''}</td><td>${l.balance < 0 ? '−' + money(-l.balance) : money(l.balance)}</td></tr>`)
        .join('')}</tbody></table>
      <table class="ti-vat ageing-print"><thead><tr>${AGE_BUCKETS.map(([, en, ar]) => `<th>${bi(en, ar)}</th>`).join('')}<th>${bi('Total owed', 'إجمالي المستحق')}</th></tr></thead><tbody><tr>${AGE_BUCKETS.map(([k]) => `<td>${money(s.ageing[k])}</td>`).join('')}<td><b>${money(s.ageing.balance_cents)}</b></td></tr></tbody></table>
      <p class="doc-footer">${esc(co.invoice_footer || 'Thank you for your business.')}<br><span lang="ar" dir="rtl">شكرًا لتعاملكم معنا.</span></p>
    </article><div class="form-actions"><button class="secondary" type="button" onclick="window.print()">Print / save PDF</button></div>`,
    true,
  );
  $('.statement-range').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    statementDialog(id, f.get('from'), f.get('to'));
  });
  $('#modal-root').querySelectorAll('.table-wrap').forEach(w => (w.dataset.enhanced = '1'));
}
