/* Atelier Perfume ERP · Secret formulas, production batches and batch costing. */
'use strict';

async function formulaPage() {
  await loadLists();
  state.formulas = (await api('formulas')).formulas;
  $('#content').innerHTML =
    pageHead(
      'Formulas, kept confidential.',
      'Versioned recipes and packaging quantities per finished bottle.',
      `<button class="primary" onclick="formulaDialog()">+ Formula version</button>`,
    ) +
    `<div class="notice">This build uses material quantities in each item's base unit per bottle. It does not convert density or mass/volume automatically. Released versions are preserved.</div>` +
    panel(
      'Formula library',
      table(
        ['Code / version', 'Formula', 'Output product', 'Materials', 'Status', ''],
        state.formulas.map(
          f =>
            `<tr><td>${esc(f.code)}<small>Version ${f.version}</small></td><td>${esc(f.name)}</td><td>${esc(f.product)}</td><td>${f.ingredients.length} ingredients · ${f.packaging.length} packaging</td><td>${badge(f.status)}</td><td><button class="subtle" onclick="formulaDetail(${f.id})">Open →</button></td></tr>`,
        ),
      ),
    );
}

function formulaDialog(from = null) {
  const f = state.formulas.find(f => f.id === from);
  state.formulaMaterials = state.products.filter(
    p => p.active && ['raw', 'intermediate', 'packaging'].includes(p.kind),
  );
  modal(
    'New formula version',
    `<form><div class="form-grid">${field('Formula code', 'code', f?.code || '')}${field('Formula name', 'name', f?.name || '')}<label>Finished output product<select name="product_id" required>${options(
      state.products.filter(p => p.kind === 'finished' && ['bottle', 'piece'].includes(p.unit)),
      'name',
      f?.product_id,
    )}</select></label>${field('Maturation period · days', 'maturation_days', f?.maturation_days || '0', 'number')}</div><div class="section-label">Ingredients per finished bottle</div><div id="ingredient-lines"></div><button type="button" class="secondary" onclick="formulaLine('ingredient')">+ Ingredient</button><div class="section-label">Packaging per finished bottle</div><div id="packaging-lines"></div><button type="button" class="secondary" onclick="formulaLine('packaging')">+ Packaging item</button><label style="margin-top:18px">Mixing / production instructions<textarea name="instructions">${esc(f?.instructions)}</textarea></label>${formActions('Save draft version')}</form>`,
    true,
  );
  (f?.ingredients || [null]).forEach(x => formulaLine('ingredient', x));
  (f?.packaging || []).forEach(x => formulaLine('packaging', x));
  bindForm(async fd => {
    const rows = container =>
      Array.from(document.querySelectorAll(container + ' .line-editor')).map(el => ({
        product_id: Number(el.querySelector('select').value),
        quantity: el.querySelector('input').value,
      }));
    await api('formulas', 'POST', {
      ...Object.fromEntries(fd),
      ingredients: rows('#ingredient-lines'),
      packaging: rows('#packaging-lines'),
    });
    closeModal();
    toast('Draft formula saved');
    await formulaPage();
  });
}

function formulaLine(kind, row = null) {
  const div = document.createElement('div');
  div.className = 'line-editor formula';
  const list = state.formulaMaterials
    .filter(p => (kind === 'packaging' ? p.kind === 'packaging' : ['raw', 'intermediate'].includes(p.kind)))
    .map(p => ({ ...p, name: p.name + ' [' + p.unit + ']' }));
  div.innerHTML = `<select required>${options(list, 'name', row?.product_id)}</select><input aria-label="Quantity per bottle in base unit" value="${row ? decimal(row.quantity_milli, 3) : '1'}" inputmode="decimal"><button type="button" class="remove" aria-label="Remove ingredient">×</button>`;
  div.querySelector('button').onclick = () => div.remove();
  $(kind === 'packaging' ? '#packaging-lines' : '#ingredient-lines').append(div);
}

function formulaDetail(id) {
  const f = state.formulas.find(f => f.id === id);
  modal(
    f.name + ' · v' + f.version,
    `<p>${badge(f.status)} <span class="muted tiny">${esc(f.code)} · Output ${esc(f.product)} · ${f.maturation_days} maturation days</span></p>${costSheetView(f.costing, 'Estimated materials per bottle')}${table(
      ['Material / packaging', 'Quantity per bottle', 'Base unit'],
      [...f.ingredients, ...f.packaging].map(
        i => `<tr><td>${esc(i.name)}</td><td>${quantity(i.quantity_milli)}</td><td>${esc(i.unit)}</td></tr>`,
      ),
    )}<p class="muted" style="margin-top:20px">${esc(f.instructions || 'No additional instructions.')}</p><div class="form-actions"><button class="secondary" onclick="formulaDialog(${id})">Create next version</button>${f.status === 'Draft' && can('manager') ? `<button class="primary" onclick="approveFormula(${id})">Approve formula</button>` : ''}</div>`,
    true,
  );
}

async function approveFormula(id) {
  try {
    await api('formulas/' + id + '/approve', 'POST', {});
    closeModal();
    toast('Formula approved');
    await formulaPage();
  } catch (e) {
    toast(e.message);
  }
}

async function productionPage() {
  await loadLists();
  if (can('manager', 'production')) state.formulas = (await api('formulas')).formulas;
  state.batches = (await api('batches')).batches;
  $('#content').innerHTML =
    pageHead(
      'The production desk',
      'Track output, ingredient and packaging costs, labour and batch profitability.',
      can('manager', 'production') ? '<button class="primary" onclick="batchDialog()">+ Plan batch</button>' : '',
    ) +
    `<div class="notice">Batch materials and packaging are issued from the approved per-bottle BOM. Actual consumption overrides, staged bottling and rework are later-stage features.</div>` +
    panel(
      'Batches',
      table(
        ['Batch', 'Product / formula', 'Planned', 'Accepted / rejected', 'Status', 'Batch cost / unit', ''],
        state.batches.map(
          b =>
            `<tr><td>${esc(b.number)}<small>${date(b.created_at)}</small></td><td>${esc(b.product)}<small>${esc(b.formula_name)} · v${b.version}</small></td><td>${b.planned}</td><td>${b.accepted} / ${b.rejected}</td><td>${badge(b.status)}</td><td>${b.costing ? money((b.costing.actual || b.costing.estimate || b.costing.issued)?.total_cents) : '—'}<small>${b.costing?.actual ? 'Recorded' : b.costing?.estimate ? 'Estimated' : 'Legacy'} · ${b.costing ? money((b.costing.actual || b.costing.estimate || b.costing.issued)?.unit_cost_cents) : '—'} / unit</small></td><td><button class="subtle" onclick="batchDetail(${b.id})">Open →</button></td></tr>`,
        ),
      ),
    );
}

function batchDialog() {
  modal(
    'Plan a production batch',
    `<form><div class="form-grid"><label class="span2">Approved formula<select name="formula_id" required>${options(state.formulas.filter(f => f.status === 'Approved').map(f => ({ ...f, name: f.name + ' · v' + f.version })))}</select></label><label>Material and output location<select name="location_id">${options(state.boot.locations, 'name', state.location)}</select></label>${field('Planned bottles / pieces', 'planned', '100', 'number')}${extraCostFields('estimated_')}</div><p class="form-hint">Materials are estimated from the approved formula. Additional costs are for the whole batch.</p>${formActions('Plan batch')}</form>`,
  );
  bindForm(async (fd, key) => {
    await api('batches', 'POST', Object.fromEntries(fd), key);
    closeModal();
    toast('Batch planned');
    await productionPage();
  });
}

function batchDetail(id) {
  const b = state.batches.find(b => b.id === id);
  const controls = {
    Planned: ['issue', 'Issue materials'],
    Mixing: ['mature', 'Start maturation'],
    Maturing: ['qc', 'Record quality check'],
    'QC Hold': ['recheck', 'Recheck quality'],
    Released: ['complete', 'Complete batch'],
  };
  const c = controls[b.status];
  modal(
    b.number,
    `<p>${badge(b.status)} <span class="muted tiny">${esc(b.product)} · ${esc(b.formula_name)} v${b.version}</span></p><div class="metric-grid"><div><small>Planned output</small><b>${b.planned}</b></div><div><small>Accepted output</small><b>${b.accepted}</b></div><div><small>Issued material cost</small><b>${money(b.material_cost_cents)}</b></div></div>${batchCostView(b)}<p class="muted tiny" style="margin-top:15px">${b.matures_at ? 'Maturation due ' + date(b.matures_at) : 'Maturation not started'}<br>${esc(b.qc_notes || 'No quality observations yet.')}<br>${esc(b.loss_reason || '')}</p>${c && can('manager', 'production') ? `<form><input type="hidden" name="action" value="${c[0]}">${c[0] === 'qc' ? '<label>Quality observations<textarea name="qc_notes" required></textarea></label><label style="margin-top:15px">Decision<select name="passed"><option value="1">Pass / release</option><option value="0">Fail / hold</option></select></label>' : ''}${c[0] === 'complete' ? `<div class="form-grid">${field('Accepted bottles', 'accepted', String(b.planned), 'number')}${field('Rejected / lost bottles', 'rejected', '0', 'number')}${extraCostFields()}<label class="span2">Loss explanation<textarea name="loss_reason"></textarea></label></div>` : ''}<div class="notice" style="margin-top:15px">${c[0] === 'issue' ? 'This deducts all required materials and packaging. Insufficient stock blocks the whole action.' : c[0] === 'complete' ? 'Only accepted output is added to stock. Accepted plus rejected must equal planned output.' : 'This advances the batch workflow and records the action.'}</div>${formActions(c[1])}</form>` : ''}`,
    true,
  );
  if (c && can('manager', 'production'))
    bindForm(async (fd, key) => {
      const v = Object.fromEntries(fd);
      if (v.passed !== undefined) v.passed = v.passed === '1';
      await api('batches/' + id, 'POST', v, key);
      closeModal();
      toast('Batch updated');
      await productionPage();
    });
}

function extraCostFields(prefix = '') {
  return ['labour', 'overhead', 'freight', 'other']
    .map(k =>
      field(
        (prefix ? 'Estimated ' : '') + k[0].toUpperCase() + k.slice(1) + ' cost · whole batch',
        prefix + k + '_cost',
        '0.00',
      ),
    )
    .join('');
}

function costSheetView(c, title) {
  if (!c) return '';
  return `<section class="cost-sheet"><div class="section-label">${esc(title)}</div><div class="metric-grid"><div><small>Total production cost</small><b>${money(c.total_cents)}</b></div><div><small>Cost per ${title.includes('Recorded') ? 'accepted' : 'planned'} unit</small><b>${c.unit_cost_cents === null ? 'No accepted output' : money(c.unit_cost_cents)}</b></div><div><small>Output basis</small><b>${c.output} units</b></div></div>${table(
    ['Cost component', 'Amount'],
    [
      ['Ingredients', c.ingredients_cents],
      ['Packaging', c.packaging_cents],
      ...Object.entries(c.extras || {})
        .filter(([k, v]) => k !== 'legacy_cents' || v)
        .map(([k, v]) => [k.replace('_cents', '').replace('legacy', 'Additional legacy cost'), v]),
    ]
      .filter(([k, v]) => v !== undefined)
      .map(([k, v]) => `<tr><td>${esc(k[0].toUpperCase() + k.slice(1))}</td><td>${money(v)}</td></tr>`),
  )}${
    c.rows?.length
      ? `<details><summary>Material quantities and unit costs</summary>${table(
          ['Material', 'Quantity / unit', 'Unit cost', 'Total'],
          c.rows.map(
            r =>
              `<tr><td>${esc(r.name)}</td><td>${quantity(r.quantity_milli)} ${esc(r.unit)}</td><td>${money(r.unit_cost_cents)}</td><td>${money(r.cost_cents)}</td></tr>`,
          ),
        )}</details>`
      : ''
  }</section>`;
}

function batchCostView(b) {
  const c = b.costing;
  if (!c) return '';
  const a = c.actual,
    e = c.estimate;
  return `<div class="cost-review">${costSheetView(a || c.issued || e, a ? 'Recorded batch cost' : c.issued ? 'Issued material cost' : 'Estimated batch cost')}${a && e ? `<p>Cost variance against estimate: <b>${money(a.total_cents - e.total_cents)}</b> · ${b.rejected} rejected units</p>` : ''}${a && a.unit_cost_cents !== null ? `<div class="notice">At the current selling price of ${money(b.selling_price_cents)} per unit, estimated gross profit is <b>${money(b.selling_price_cents - a.unit_cost_cents)}</b> per unit (${b.selling_price_cents ? (((b.selling_price_cents - a.unit_cost_cents) / b.selling_price_cents) * 100).toFixed(1) : '0'}% margin). Excludes sales taxes and selling expenses. This is a current-price estimate; invoice profit uses the actual sale price.</div>` : ''}${(a || c.issued) && e ? `<details><summary>Original estimate</summary>${costSheetView(e, 'Original estimated batch cost')}</details>` : ''}<p class="form-hint">Issued material cost comes from the stock lots consumed. New purchases use supplier bill prices after discounts, excluding tax. Recipe quantities are used; measured consumption overrides remain pending.</p></div>`;
}
