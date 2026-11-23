/* Atelier Perfume ERP · Overview dashboard. */
'use strict';

/** Round axis maximum up to a clean value and return 4 evenly spaced ticks. */
function niceTicks(max) {
  if (max <= 0) return [0, 1, 2, 3];
  const raw = max / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= raw);
  return [0, step, step * 2, step * 3];
}

/** Short money for axis labels: 1,500 / 12.5K / 1.2M (whole currency units). */
function compactMoney(cents) {
  const v = cents / 100;
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return Math.round(v).toLocaleString('en');
}

/** Single-series column chart (one bar per day) with a hover tooltip and a table view. */
function salesColumnChart(trend) {
  const narrow = window.innerWidth < 700;
  const width = narrow ? 340 : 640, height = narrow ? 200 : 220, left = narrow ? 40 : 52, right = 8, top = 14, bottom = 28;
  const labelEvery = narrow ? 4 : 2;
  const plotW = width - left - right, plotH = height - top - bottom;
  const peak = Math.max(...trend.map(d => d.total));
  const ticks = niceTicks(peak || 30000);
  const yMax = ticks[ticks.length - 1];
  const band = plotW / trend.length;
  const barW = Math.min(24, band * 0.62);
  const y = v => top + plotH - (v / yMax) * plotH;
  const best = trend.reduce((a, d, i) => (d.total > trend[a].total ? i : a), 0);
  const label = d => new Date(d.day + 'T00:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' });
  const grid = ticks
    .map(t => `<line x1="${left}" x2="${width - right}" y1="${y(t)}" y2="${y(t)}" class="chart-grid"/><text x="${left - 8}" y="${y(t) + 4}" text-anchor="end" class="chart-axis">${compactMoney(t)}</text>`)
    .join('');
  const bars = trend
    .map((d, i) => {
      const x = left + band * i + (band - barW) / 2;
      const h = Math.max(0, y(0) - y(d.total));
      const r = Math.min(4, h);
      const path = h
        ? `<path class="chart-bar-mark" d="M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z"/>`
        : '';
      const xLabel = (trend.length - 1 - i) % labelEvery ? '' : `<text x="${x + barW / 2}" y="${height - 8}" text-anchor="middle" class="chart-axis">${label(d)}</text>`;
      const valueLabel = i === best && d.total ? `<text x="${x + barW / 2}" y="${y(d.total) - 6}" text-anchor="middle" class="chart-value">${compactMoney(d.total)}</text>` : '';
      const tip = `${label(d)} · ${money(d.total)} · ${d.count} sale${d.count === 1 ? '' : 's'}`;
      return `${path}${valueLabel}${xLabel}<rect class="chart-hit" x="${left + band * i}" y="${top}" width="${band}" height="${plotH}" data-tip="${esc(tip)}"/>`;
    })
    .join('');
  const empty = peak ? '' : `<text x="${left + plotW / 2}" y="${top + plotH / 2}" text-anchor="middle" class="chart-empty">No sales in the last ${trend.length} days</text>`;
  return `<div class="chart-box"><svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Sales per day for the last ${trend.length} days">${grid}<line x1="${left}" x2="${width - right}" y1="${y(0)}" y2="${y(0)}" class="chart-baseline"/>${bars}${empty}</svg><div class="chart-tip" hidden></div></div><details class="chart-table"><summary>View as table</summary>${table(['Day', 'Sales', 'Total'], trend.map(d => `<tr><td>${label(d)}</td><td>${d.count}</td><td>${money(d.total)}</td></tr>`))}</details>`;
}

/** Plural for counted units (bottle → bottles); measured units (ml, g, kg) stay as they are. */
function unitLabel(unit, quantityMilli) {
  return ['bottle', 'piece', 'box', 'carton', 'hour'].includes(unit) && quantityMilli !== 1000 ? unit + 's' : unit;
}

/** Horizontal bars for the best-selling products, value at each bar's tip. */
function bestSellerBars(products) {
  if (!products.length) return '<div class="empty">Sales from the last 30 days will appear here.</div>';
  const max = Math.max(...products.map(p => p.revenue_cents), 1);
  return `<div class="panel-body hbar-list">${products
    .map(
      p => `<div class="hbar-row" data-tip="${esc(p.name + ' · ' + money(p.revenue_cents) + ' · ' + quantity(p.quantity_milli) + ' ' + p.unit)}">
        <div class="hbar-label"><b>${esc(p.name)}</b><small>${quantity(p.quantity_milli)} ${esc(unitLabel(p.unit, p.quantity_milli))} sold</small></div>
        <div class="hbar-track"><i style="width:${Math.max(2, (p.revenue_cents / max) * 100)}%"></i><span>${compactMoney(p.revenue_cents)}</span></div>
      </div>`,
    )
    .join('')}</div>`;
}

/** Wire hover tooltips for every element with data-tip inside a chart panel. */
function bindChartTips(root) {
  root.querySelectorAll('.chart-box').forEach(box => {
    const tip = box.querySelector('.chart-tip');
    box.querySelectorAll('[data-tip]').forEach(el => {
      el.addEventListener('mouseenter', () => {
        tip.textContent = el.dataset.tip;
        tip.hidden = false;
        const b = el.getBoundingClientRect(), o = box.getBoundingClientRect();
        tip.style.left = Math.min(o.width - tip.offsetWidth, Math.max(0, b.left - o.left + b.width / 2 - tip.offsetWidth / 2)) + 'px';
        tip.style.top = '0px';
        el.classList.add('is-hover');
      });
      el.addEventListener('mouseleave', () => {
        tip.hidden = true;
        el.classList.remove('is-hover');
      });
    });
  });
}

function statTile(label, value, foot, delta = '') {
  return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-number">${value}</div>${delta}<div class="stat-foot">${foot}</div></div>`;
}

/** Signed change vs the previous period; up is good for sales. */
function deltaBadge(current, previous) {
  if (!previous) return current ? '<div class="stat-delta up">▲ New this period</div>' : '';
  const change = ((current - previous) / previous) * 100;
  const dir = change >= 0 ? 'up' : 'down';
  return `<div class="stat-delta ${dir}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(0)}% vs previous 30 days</div>`;
}

async function dashboardPage() {
  const d = await api('dashboard');
  const s = d.sales;
  const first = esc(state.boot.user.name.split(' ')[0]);
  const today = new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' });
  const stats = s
    ? statTile('Sales · last 30 days', money(s.period.revenue_cents), `${s.period.documents} posted sales and invoices`, deltaBadge(s.period.revenue_cents, s.period.previous_revenue_cents)) +
      statTile(
        'Gross profit · last 30 days',
        money(s.period.gross_profit_cents),
        s.period.costed_revenue_cents ? `${((s.period.gross_profit_cents / s.period.costed_revenue_cents) * 100).toFixed(1)}% margin on costed sales` : 'No costed sales yet',
      ) +
      statTile('Outstanding payments', money(d.outstanding_cents), 'Customer balances to collect') +
      statTile('Average sale', money(s.period.average_sale_cents), 'Per posted sale or invoice, last 30 days')
    : statTile('Products in catalogue', d.products, 'Active fragrances, materials and services') +
      statTile('Batches in progress', d.production, 'Mixing, maturation and quality review') +
      statTile('Design projects', d.projects, 'Briefs, artwork and packaging in progress') +
      statTile('Stock to watch', d.low_stock.length, 'Products at or below their reorder level');

  const lowStock = d.low_stock.length
    ? d.low_stock
        .slice(0, 6)
        .map(
          p =>
            `<div class="list-row"><span class="status-pill warning">Low</span><span class="grow"><b>${esc(p.name)}</b><small>${esc(p.sku)} · reorder at ${quantity(p.reorder_milli)}</small></span><span>${quantity(p.stock)} <small>${esc(p.unit)}</small></span></div>`,
        )
        .join('')
    : '<div class="empty">All stocked products are above their reorder level.</div>';

  $('#content').innerHTML =
    pageHead(
      `Good to see you, ${first}.`,
      `${today} · here is what is happening across your perfume business.`,
      `<a class="secondary" href="#catalogue">Browse products ↗</a>${can('manager', 'cashier') ? '<a class="primary" href="#pos">Open POS →</a>' : ''}`,
    ) +
    `<div class="stats">${stats}</div>` +
    `<div class="dashboard-grid"><div>` +
    (s
      ? panel('Sales per day · last 14 days', `<div class="panel-body">${salesColumnChart(s.trend)}</div>`, `<a class="subtle" href="#reports">Reports →</a>`) +
        panel('Best sellers · last 30 days', `<div class="chart-box">${bestSellerBars(s.top_products)}<div class="chart-tip" hidden></div></div>`)
      : '') +
    panel(
      'Recent documents',
      table(
        ['Document', 'Customer', 'Status', 'Total'],
        d.recent.map(
          r =>
            `<tr><td><button class="subtle" onclick="documentDetail(${r.id})">${esc(r.number)}</button><small>${esc(r.kind)} · ${date(r.created_at)}</small></td><td>${esc(r.contact_name || (r.contact_id ? 'Customer #' + r.contact_id : 'Walk-in'))}</td><td>${badge(r.status)}</td><td>${money(r.total_cents)}</td></tr>`,
        ),
        'Your first sale or quotation will appear here.',
      ),
    ) +
    `</div><div>` +
    panel('Stock to watch', lowStock, `<a class="subtle" href="#inventory">View stock →</a>`) +
    (d.expiring?.length
      ? panel(
          'Expiring soon · 60 days',
          d.expiring
            .slice(0, 6)
            .map(e => `<div class="list-row">${expiryBadge(e.expires_on).split(' <small>')[0]}<span class="grow"><b>${esc(e.name)}</b><small>${esc(e.lot)} · ${esc(e.location)}</small></span><span>${quantity(e.quantity_milli)} <small>${esc(e.unit)}</small></span></div>`)
            .join(''),
          `<a class="subtle" href="#inventory">Inventory →</a>`,
        )
      : '') +
    panel(
      'Production desk',
      d.batches.length
        ? d.batches.map(b => `<div class="list-row"><span class="grow"><b>${esc(b.number)}</b><small>${esc(b.formula_name)} · ${b.planned} planned</small></span>${badge(b.status)}</div>`).join('')
        : '<div class="empty">No production batches yet.</div>',
      `<a class="subtle" href="#production">Open →</a>`,
    ) +
    panel('Creative work', `<div class="panel-body"><p class="muted">${d.projects} design or packaging project${d.projects === 1 ? '' : 's'} in progress.</p><a class="subtle" href="#projects">Open the creative desk →</a></div>`) +
    `</div></div>`;
  bindChartTips($('#content'));
}
