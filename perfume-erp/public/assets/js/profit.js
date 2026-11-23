/* Atelier Perfume ERP · Profit and loss: monthly revenue, cost of goods, expenses and net profit. */
'use strict';

async function profitLossPage(year = state.plYear) {
  const d = await api('profit-loss' + (year ? '?year=' + year : ''));
  state.plYear = d.year;
  const t = d.totals;
  const pct = (part, whole) => (whole ? ((part / whole) * 100).toFixed(1) + '%' : '—');
  const monthName = m => new Date(m + '-01T00:00:00').toLocaleDateString('en', { month: 'short' });
  const signed = c => (c < 0 ? '−' + money(-c) : money(c));
  $('#content').innerHTML =
    pageHead('Profit & loss', 'Sales minus cost of goods and expenses, month by month. Amounts exclude VAT.', `<select id="pl-year" aria-label="Year">${d.years.map(y => `<option value="${y}" ${y === d.year ? 'selected' : ''}>${y}</option>`).join('')}</select><a class="secondary" href="/api/profit-loss?csv=1&year=${d.year}">Export CSV ↓</a>`) +
    (d.uncosted_lines ? `<div class="notice">${d.uncosted_lines} sold line(s) have no recorded cost, so cost of goods may be understated.</div>` : '') +
    `<div class="stats">${statTile('Revenue', money(t.revenue_cents), 'Sales excluding VAT, after returns')}${statTile('Gross profit', signed(t.gross_profit_cents), pct(t.gross_profit_cents, t.revenue_cents) + ' gross margin')}${statTile('Expenses', money(t.expenses_cents), 'Running costs excluding VAT')}${statTile('Net profit', signed(t.net_profit_cents), pct(t.net_profit_cents, t.revenue_cents) + ' net margin')}</div>` +
    panel('Net profit by month', `<div class="panel-body">${netProfitChart(d.months, monthName)}</div>`) +
    panel(
      'Monthly statement',
      table(
        ['Month', 'Revenue', 'Cost of goods', 'Gross profit', 'Expenses', 'Net profit', 'Net margin'],
        d.months
          .map(m => `<tr><td>${monthName(m.month)}</td><td>${money(m.revenue_cents)}</td><td>${money(m.cogs_cents)}</td><td>${signed(m.gross_profit_cents)}</td><td>${money(m.expenses_cents)}</td><td class="${m.net_profit_cents < 0 ? 'negative' : ''}"><b>${signed(m.net_profit_cents)}</b></td><td>${pct(m.net_profit_cents, m.revenue_cents)}</td></tr>`)
          .concat(`<tr class="total-row"><td><b>Total</b></td><td><b>${money(t.revenue_cents)}</b></td><td><b>${money(t.cogs_cents)}</b></td><td><b>${signed(t.gross_profit_cents)}</b></td><td><b>${money(t.expenses_cents)}</b></td><td class="${t.net_profit_cents < 0 ? 'negative' : ''}"><b>${signed(t.net_profit_cents)}</b></td><td><b>${pct(t.net_profit_cents, t.revenue_cents)}</b></td></tr>`),
      ),
    ) +
    panel('Expenses by category', d.categories.length ? table(['Category', 'Amount', 'Share'], d.categories.map(c => `<tr><td>${esc(c.category)}</td><td>${money(c.amount_cents)}</td><td>${pct(c.amount_cents, t.expenses_cents)}</td></tr>`)) : '<div class="empty">No expenses recorded this year.</div>', '<a class="subtle" href="#expenses">Expenses →</a>');
  /* The statement keeps its month order and total row: no sorting or filtering. */
  $('#content').querySelectorAll('.table-wrap').forEach(w => (w.dataset.enhanced = '1'));
  $('#pl-year').addEventListener('change', e => profitLossPage(Number(e.target.value)));
  bindChartTips($('#content'));
}

/** Monthly net profit as columns above (profit) or below (loss) a zero line, with hover details. */
function netProfitChart(months, monthName) {
  const narrow = window.innerWidth < 700;
  const width = narrow ? 340 : 900, height = 240, left = narrow ? 44 : 60, right = 8, top = 16, bottom = 28;
  const values = months.map(m => m.net_profit_cents);
  const hi = Math.max(0, ...values), lo = Math.min(0, ...values);
  if (!hi && !lo) return '<div class="empty">No sales or expenses recorded this year.</div>';
  const step = niceTicks(Math.max(hi, -lo))[1];
  const yMax = Math.ceil(hi / step) * step, yMin = Math.floor(lo / step) * step;
  const span = yMax - yMin || step;
  const plotH = height - top - bottom, plotW = width - left - right;
  const y = v => top + ((yMax - v) / span) * plotH;
  const band = plotW / 12, barW = Math.min(24, band * 0.6);
  const ticks = [];
  for (let v = yMin; v <= yMax; v += step) ticks.push(v);
  const grid = ticks.map(v => `<line x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'chart-baseline' : 'chart-grid'}"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end" class="chart-axis">${v < 0 ? '−' : ''}${compactMoney(Math.abs(v))}</text>`).join('');
  const bars = months
    .map((m, i) => {
      const v = m.net_profit_cents, x = left + band * i + (band - barW) / 2;
      const y0 = y(0), y1 = y(v), h = Math.abs(y1 - y0), r = Math.min(4, h);
      const path = !h ? '' : v > 0
        ? `<path class="chart-bar-mark" d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y0} Z"/>`
        : `<path class="chart-bar-loss" d="M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 - r} V${y0} Z"/>`;
      const label = !narrow || i % 2 === 0 ? `<text x="${x + barW / 2}" y="${height - 8}" text-anchor="middle" class="chart-axis">${monthName(m.month)}</text>` : '';
      const tip = `${monthName(m.month)} · revenue ${money(m.revenue_cents)} · expenses ${money(m.expenses_cents)} · net ${v < 0 ? '−' + money(-v) : money(v)}`;
      return `${path}${label}<rect class="chart-hit" x="${left + band * i}" y="${top}" width="${band}" height="${plotH}" data-tip="${esc(tip)}"/>`;
    })
    .join('');
  return `<div class="chart-box"><svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="Net profit by month"><defs><pattern id="loss-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="loss-bg"/><line x1="0" y1="0" x2="0" y2="6" class="loss-line"/></pattern></defs>${grid}${bars}</svg><div class="chart-tip" hidden></div></div><p class="chart-legend"><i class="key profit"></i> Profit <i class="key loss"></i> Loss</p>`;
}
