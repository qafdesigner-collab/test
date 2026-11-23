/* Atelier Perfume ERP · Business expenses: rent, salaries, utilities and other running costs. */
'use strict';

async function expensesPage(month = state.expenseMonth) {
  const d = await api('expenses' + (month ? '?month=' + month : ''));
  state.expenseMonth = d.month;
  state.expenseCategories = d.categories;
  await loadLists();
  const label = new Date(d.month + '-01T00:00:00').toLocaleDateString(state.lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en', { month: 'long', year: 'numeric' });
  const max = Math.max(...d.by_category.map(c => c.amount_cents), 1);
  $('#content').innerHTML =
    pageHead('Expenses', 'Rent, salaries, utilities and other running costs. Voided entries stay visible for the audit trail.', '<button class="primary" onclick="expenseDialog()">+ Record expense</button>') +
    `<div class="month-picker"><button class="secondary" onclick="expensesPage(shiftMonth(state.expenseMonth, -1))" aria-label="Previous month">‹</button><b>${esc(label)}</b><button class="secondary" onclick="expensesPage(shiftMonth(state.expenseMonth, 1))" aria-label="Next month">›</button></div>` +
    `<div class="stats">${statTile('Expenses this month', money(d.total_cents), `${d.expenses.filter(e => !e.voided_at).length} entries`)}${statTile('VAT paid on expenses', money(d.tax_cents), 'Recoverable input VAT, if registered')}${statTile('Largest category', d.by_category[0] ? esc(d.by_category[0].category) : '—', d.by_category[0] ? money(d.by_category[0].amount_cents) : 'No expenses yet')}</div>` +
    `<div class="dashboard-grid"><div>` +
    panel(
      'Expense list',
      table(
        ['Number', 'Date', 'Category', 'Description', 'Paid by', 'Amount', ''],
        d.expenses.map(
          e =>
            `<tr class="${e.voided_at ? 'voided' : ''}"><td><b>${esc(e.number)}</b>${e.reference ? `<small>${esc(e.reference)}</small>` : ''}</td><td>${date(e.spent_on)}</td><td>${esc(e.category)}</td><td>${esc(e.description)}${e.supplier ? `<small>${esc(e.supplier)}</small>` : ''}${e.voided_at ? `<small class="returned-note">Voided · ${esc(e.void_reason)}</small>` : ''}</td><td>${esc(e.method)}${e.from_drawer ? '<small>Cashier drawer</small>' : ''}</td><td>${money(e.amount_cents)}${Number(e.tax_cents) ? `<small>VAT ${money(e.tax_cents)}</small>` : ''}</td><td>${e.voided_at ? badge('Voided') : `<button class="subtle" onclick="voidExpenseDialog(${e.id}, '${esc(e.number)}')">Void</button>`}</td></tr>`,
        ),
        'No expenses recorded for this month.',
      ),
    ) +
    `</div><div>` +
    panel(
      'By category',
      d.by_category.length
        ? `<div class="chart-box"><div class="panel-body hbar-list">${d.by_category
            .map(c => `<div class="hbar-row"><div class="hbar-label"><b>${esc(c.category)}</b><small>${c.count} ${c.count === 1 ? 'entry' : 'entries'}</small></div><div class="hbar-track"><i style="width:${Math.max(2, (c.amount_cents / max) * 100)}%"></i><span>${compactMoney(c.amount_cents)}</span></div></div>`)
            .join('')}</div></div>`
        : '<div class="empty">Nothing recorded this month.</div>',
    ) +
    `</div></div>`;
}

function shiftMonth(month, step) {
  const d = new Date(month + '-01T00:00:00');
  d.setMonth(d.getMonth() + step);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function expenseDialog() {
  const today = new Date().toISOString().slice(0, 10);
  modal(
    'Record an expense',
    `<form><div class="form-grid">${field('Date', 'spent_on', today, 'date')}<label>Category<input name="category" list="expense-categories" required maxlength="80" placeholder="Rent, Salaries & wages…"><datalist id="expense-categories">${(state.expenseCategories || []).map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="span2">Description<input name="description" required maxlength="300" placeholder="For example: November shop rent"></label>
    ${field('Amount including VAT', 'amount', '', 'text', '')}${field('VAT included (optional)', 'tax', '0.00')}
    <label>Paid by<select name="method">${selectOptions(['Bank', 'Cash', 'Card'], 'Bank')}</select></label>
    <label>Supplier (optional)<select name="contact_id">${options(state.contacts.filter(c => c.kind === 'supplier'), 'name', '', 'No supplier')}</select></label>
    ${field('Receipt / bill reference (optional)', 'reference', '')}
    <label class="check-row"><input type="checkbox" name="from_drawer" value="1" style="width:auto"> Paid in cash from my cashier drawer</label></div>${formActions('Save expense')}</form>`,
  );
  bindForm(async (fd, key) => {
    const v = Object.fromEntries(fd);
    v.contact_id = v.contact_id ? Number(v.contact_id) : null;
    v.from_drawer = v.from_drawer === '1';
    const r = await api('expenses', 'POST', v, key);
    closeModal();
    toast(r.number + ' saved');
    await expensesPage(v.spent_on.slice(0, 7));
  });
}

function voidExpenseDialog(id, number) {
  modal(
    'Void ' + number,
    `<form><div class="notice">The expense stays in the list, marked as voided, and no longer counts in totals or profit.</div><label>Reason<input name="reason" required maxlength="300" placeholder="Entered twice, wrong amount…"></label>${formActions('Void expense')}</form>`,
  );
  bindForm(async fd => {
    await api('expenses/' + id + '/void', 'POST', { reason: fd.get('reason') });
    closeModal();
    toast(number + ' voided');
    await expensesPage();
  });
}
