/* Atelier Perfume ERP · Overview dashboard. */
'use strict';

async function dashboardPage() {
  const d = await api('dashboard');
  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - 6 + i);
    return { day: dt.toISOString().slice(0, 10), label: dt.toLocaleDateString('en', { weekday: 'short' }) };
  });
  const totals = days.map(day => Number(d.trend.find(t => t.day === day.day)?.total || 0));
  const max = Math.max(...totals, 1);
  const stat = (label, n, foot, icon) =>
    `<div class="stat"><span class="stat-icon">${icon}</span><div class="stat-label">${label}</div><div class="stat-number">${n}</div><div class="stat-foot">${foot}</div></div>`;
  $('#content').innerHTML =
    pageHead(
      'Good to see you, ' + state.boot.user.name.split(' ')[0] + '.',
      'Here is what is happening across your perfume business.',
      `<a class="secondary" href="#catalogue">Browse products ↗</a>${can('manager', 'cashier') ? '<a class="primary" href="#pos">Open POS →</a>' : ''}`,
    ) +
    `<div class="stats">${stat('Sales · active invoices', d.revenue_cents === null ? 'Restricted' : money(d.revenue_cents), 'Posted sales, excluding returned documents', '↗')}${stat('Outstanding payments', d.outstanding_cents === null ? 'Restricted' : money(d.outstanding_cents), 'Customer balances to collect', '◷')}${stat('Products in catalogue', d.products, 'Active fragrances, materials & services', '◇')}${stat('Batches in progress', d.production, 'Mixing, maturation and quality review', '⚗')}</div><div class="welcome-banner"><h2>From the first note<br>to the final bottle.</h2><p>Your products, production and customer orders, together in one place.</p></div><div class="dashboard-grid"><div>${panel('Sales over the last 7 days', `<div class="panel-body"><div class="chart">${days.map((day, i) => `<div class="chart-bar"><b>${d.revenue_cents === null ? '—' : money(totals[i])}</b><i style="height:${Math.max(2, (totals[i] / max) * 115)}px"></i><span>${day.label}</span></div>`).join('')}</div></div>`)}${panel(
      'Recent documents',
      table(
        ['Document', 'Customer', 'Status', 'Total'],
        d.recent.map(
          r =>
            `<tr><td><button class="subtle" onclick="documentDetail(${r.id})">${esc(r.number)}</button><small>${esc(r.kind)} · ${date(r.created_at)}</small></td><td>${r.contact_id ? 'Customer #' + r.contact_id : 'Walk-in'}</td><td>${badge(r.status)}</td><td>${money(r.total_cents)}</td></tr>`,
        ),
        'Your first sale or quotation will appear here.',
      ),
    )}</div><div>${panel(
      'Stock to watch',
      d.low_stock.length
        ? d.low_stock
            .slice(0, 6)
            .map(
              p =>
                `<div class="list-row"><span class="badge amber">!</span><span class="grow"><b>${esc(p.name)}</b><small>${esc(p.sku)}</small></span><span>${quantity(p.stock)} <small>${esc(p.unit)}</small></span></div>`,
            )
            .join('')
        : '<div class="empty">All stocked products are above their reorder level.</div>',
      `<a class="subtle" href="#inventory">View stock →</a>`,
    )}${panel('Production desk', d.batches.length ? d.batches.map(b => `<div class="list-row"><span class="grow"><b>${esc(b.number)}</b><small>${esc(b.formula_name)} · ${b.planned} planned</small></span>${badge(b.status)}</div>`).join('') : '<div class="empty">No production batches yet.</div>')}${panel('Creative work', `<div class="panel-body"><p class="muted">${d.projects} design or packaging projects in progress.</p><a class="subtle" href="#projects">Open the creative desk →</a></div>`)}</div></div>`;
}
