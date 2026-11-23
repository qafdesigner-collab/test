/* Atelier Perfume ERP · Table enhancements: sort by column, quick filter and pages, applied to every table. */
'use strict';

const TABLE_PAGE_SIZE = 25;
const TABLE_FILTER_FROM = 11;

/** Turn cell text into something sortable: numbers (money, quantities, %), dates, or plain text. */
function sortableValue(text) {
  const t = text.trim();
  const number = t.replace(/^[A-Z]{3}\s*/, '').replace(/[,%\s]/g, '').match(/^[−-]?\d+(\.\d+)?/);
  if (number && /^[A-Z]{0,3}\s*[−-]?[\d,]+(\.\d+)?\s*(%|[a-z]{0,8})?$/i.test(t)) return { kind: 0, value: Number(number[0].replace('−', '-')) };
  const date = /^[A-Z][a-z]{2} \d{1,2}, \d{4}/.test(t) ? Date.parse(t.slice(0, 12)) : NaN;
  if (!Number.isNaN(date)) return { kind: 1, value: date };
  return { kind: 2, value: t.toLowerCase() };
}

function compareValues(a, b) {
  if (a.kind !== b.kind) return a.kind - b.kind;
  return a.kind === 2 ? a.value.localeCompare(b.value, 'en', { numeric: true }) : a.value - b.value;
}

function enhanceTable(wrap) {
  const tableEl = wrap.querySelector('table');
  const body = tableEl?.tBodies[0];
  if (!body || wrap.dataset.enhanced) return;
  wrap.dataset.enhanced = '1';
  const rows = [...body.rows];
  const sortable = rows.length > 2 && !body.querySelector('td[colspan], th[colspan]');
  const filterable = rows.length >= TABLE_FILTER_FROM;
  const view = { query: '', page: 0, column: -1, direction: 1 };
  let bar = null;

  if (filterable) {
    bar = document.createElement('div');
    bar.className = 'table-tools';
    bar.innerHTML = `<div class="table-search" role="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Filter ${rows.length} rows…" aria-label="Filter rows"></div><span class="table-count" aria-live="polite"></span><span class="table-pager"><button type="button" class="subtle" data-step="-1" aria-label="Previous page">‹</button><button type="button" class="subtle" data-step="1" aria-label="Next page">›</button></span>`;
    wrap.before(bar);
    bar.querySelector('input').addEventListener('input', e => {
      view.query = e.target.value.trim().toLowerCase();
      view.page = 0;
      update();
    });
    bar.querySelectorAll('[data-step]').forEach(btn =>
      btn.addEventListener('click', () => {
        view.page += Number(btn.dataset.step);
        update();
      }),
    );
  }

  if (sortable) {
    [...tableEl.tHead.rows[0].cells].forEach((th, index) => {
      if (!th.textContent.trim()) return;
      th.classList.add('sortable');
      th.tabIndex = 0;
      th.setAttribute('aria-sort', 'none');
      const sortBy = () => {
        view.direction = view.column === index ? -view.direction : 1;
        view.column = index;
        [...tableEl.tHead.rows[0].cells].forEach(c => c.hasAttribute('aria-sort') && c.setAttribute('aria-sort', 'none'));
        th.setAttribute('aria-sort', view.direction === 1 ? 'ascending' : 'descending');
        const keyed = [...body.rows].map(r => [sortableValue(r.cells[index]?.innerText || ''), r]);
        keyed.sort((a, b) => compareValues(a[0], b[0]) * view.direction);
        keyed.forEach(([, r]) => body.append(r));
        update();
      };
      th.addEventListener('click', sortBy);
      th.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), sortBy()));
    });
  }

  function update() {
    if (!filterable) return;
    const all = [...body.rows];
    const matching = all.filter(r => !view.query || r.innerText.toLowerCase().includes(view.query));
    const pages = Math.max(1, Math.ceil(matching.length / TABLE_PAGE_SIZE));
    view.page = Math.min(Math.max(0, view.page), pages - 1);
    const from = view.page * TABLE_PAGE_SIZE;
    const visible = new Set(matching.slice(from, from + TABLE_PAGE_SIZE));
    all.forEach(r => (r.hidden = !visible.has(r)));
    bar.querySelector('.table-count').textContent = matching.length
      ? `${from + 1}–${Math.min(from + TABLE_PAGE_SIZE, matching.length)} of ${matching.length}${view.query ? ' matching' : ''}`
      : 'No matching rows';
    const [prev, next] = bar.querySelectorAll('[data-step]');
    prev.disabled = view.page === 0;
    next.disabled = view.page >= pages - 1;
    bar.querySelector('.table-pager').hidden = pages === 1;
  }
  update();
}

function enhanceTables(root = document) {
  root.querySelectorAll('.table-wrap:not([data-enhanced])').forEach(enhanceTable);
}

/** Enhance tables whenever page content or a dialog is redrawn. */
function watchTables() {
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhanceTables();
    });
  });
  ['#content', '#modal-root'].forEach(sel => observer.observe($(sel), { childList: true, subtree: true }));
}
