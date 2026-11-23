/* Atelier Perfume ERP · Shared state, formatting, API client and dialog helpers. */
'use strict';

const state = {
  boot: null,
  products: [],
  contacts: [],
  references: [],
  formulas: [],
  batches: [],
  projects: [],
  cart: [],
  location: 1,
  view: 'grid',
  filters: {},
  busy: false,
};

const $ = s => document.querySelector(s);
const esc = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const money = n =>
  `${state.boot?.settings.currency || 'AED'} ${((n || 0) / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const decimal = (n, p = 2) => (Number(n || 0) / 10 ** p).toFixed(p);

const quantity = n => (Number(n || 0) / 1000).toLocaleString('en', { maximumFractionDigits: 3 });

const oldDate = s =>
  s
    ? new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).toLocaleDateString('en', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const date = s =>
  s
    ? new Date(
        String(s).replace(' ', 'T') + (/(Z|[+-]\d{2}:\d{2})$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s) ? '' : 'Z'),
      ).toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const can = (...roles) => state.boot?.user.role === 'owner' || roles.includes(state.boot?.user.role);

const badge = s =>
  `<span class="badge ${['Posted', 'Completed', 'Approved', 'Accepted', 'Released', 'Delivered', 'Received', 'Invoiced'].includes(s) ? 'green' : ['QC Hold', 'Declined', 'Returned', 'Revision', 'Cancelled'].includes(s) ? 'red' : ['Draft', 'Review', 'Planned', 'Maturing', 'Ordered', 'Partially received'].includes(s) ? 'amber' : 'blue'}">${esc(s)}</span>`;

const options = (rows, label = 'name', selected = '', blank = 'Choose…') =>
  `<option value="">${esc(blank)}</option>` +
  rows
    .map(
      r => `<option value="${r.id}" ${String(r.id) === String(selected) ? 'selected' : ''}>${esc(r[label])}</option>`,
    )
    .join('');

const selectOptions = (values, selected = '') =>
  values.map(s => `<option value="${esc(s)}" ${s === selected ? 'selected' : ''}>${esc(s)}</option>`).join('');

function toast(s) {
  $('#toast').textContent = s;
  $('#toast').classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3600);
}

async function api(path, method = 'GET', data = null, key = null) {
  const headers = { Accept: 'application/json', 'X-CSRF-TOKEN': $('meta[name="csrf-token"]').content };
  let body;
  if (data instanceof FormData) body = data;
  else if (data) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
  }
  if (method !== 'GET') headers['Idempotency-Key'] = key || crypto.randomUUID();
  let response;
  try {
    response = await fetch('/api/' + path, { method, headers, body });
  } catch {
    throw new Error('Cannot reach your server. Check the server and network before retrying.');
  }
  if (response.status === 419) throw new Error('Your session expired. Reload this page and sign in again.');
  if (response.status === 401) {
    location.href = '/login';
    throw new Error('Please sign in again.');
  }
  const result = await response.json().catch(() => ({ message: 'The server could not complete this action.' }));
  if (!response.ok)
    throw new Error(result.errors ? Object.values(result.errors).flat().join(' ') : result.message || 'Action failed.');
  return result;
}

function pageHead(title, sub, actions = '') {
  return `<div class="page-head"><div><p class="eyebrow">YOUR BUSINESS, CONNECTED</p><h1>${esc(title)}</h1><p class="muted">${esc(sub)}</p></div><div class="actions">${actions}</div></div>`;
}

function panel(title, body, action = '') {
  return `<section class="panel"><div class="panel-head"><h2>${esc(title)}</h2>${action}</div>${body}</section>`;
}

function table(heads, rows, empty = 'No records yet.') {
  return rows.length
    ? `<div class="table-wrap"><table><thead><tr>${heads.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : `<div class="empty"><h3>A fresh start.</h3>${esc(empty)}</div>`;
}

function modal(title, html, wide = false) {
  $('#modal-root').innerHTML =
    `<div class="modal-overlay"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="modal-header"><h2>${esc(title)}</h2><button class="modal-close" aria-label="Close dialog" onclick="closeModal()">×</button></header><div class="modal-body"><div id="form-error" class="error" hidden></div>${html}</div></section></div>`;
  setTimeout(() => $('.modal input,.modal select,.modal button')?.focus(), 30);
}

function closeModal() {
  $('#modal-root').innerHTML = '';
  if (state.boot && typeof applyBranding === 'function') applyBranding();
}

function formActions(text = 'Save') {
  return `<div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button type="submit" class="primary">${text} →</button></div>`;
}

function bindForm(handler) {
  const form = $('.modal form');
  const key = crypto.randomUUID();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (state.busy) return;
    state.busy = true;
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    $('#form-error').hidden = true;
    try {
      await handler(new FormData(form), key);
    } catch (err) {
      if ($('#form-error')) {
        $('#form-error').textContent = err.message;
        $('#form-error').hidden = false;
        $('#form-error').scrollIntoView({ block: 'nearest' });
      } else toast(err.message);
    } finally {
      state.busy = false;
      if (btn) btn.disabled = false;
    }
  });
}

function field(label, name, value = '', type = 'text', extra = '') {
  return `<label ${extra}>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${['price', 'cost', 'tax', 'reorder', 'quantity', 'amount', 'charge', 'credit'].includes(name) ? 'inputmode="decimal"' : ''}></label>`;
}

async function loadLists() {
  state.products = (await api('products?location_id=' + state.location)).products;
  if (can('manager', 'warehouse', 'accountant', 'cashier', 'designer'))
    state.contacts = (await api('contacts')).contacts;
  if (can('manager', 'designer')) state.staff = (await api('staff')).staff;
  if (can('manager', 'warehouse', 'cashier', 'production')) state.references = (await api('references')).references;
}

function fileSize(bytes) {
  return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
