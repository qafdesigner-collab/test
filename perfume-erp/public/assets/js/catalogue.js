/* Atelier Perfume ERP · Perfume catalogue: product cards, filters, product form, images, inspiration references and fragrance profiles. */
'use strict';

/** Bottle colours by the first recognised scent family: [glass tint, liquid]. */
const FAMILY_COLORS = [
  [/citrus/i, ['#f1e6bf', '#c9a227']],
  [/aqua|marine|ocean/i, ['#d6e6ee', '#4f8fb0']],
  [/fresh/i, ['#d7ebe6', '#4f9e8f']],
  [/floral|rose|jasmine/i, ['#f1dbe0', '#c0627c']],
  [/oud/i, ['#e2d3cc', '#6b3f2e']],
  [/wood|cedar|sandal/i, ['#e6dbcd', '#8b6744']],
  [/amber|oriental/i, ['#f1dcc2', '#c77a2c']],
  [/gourmand|vanilla|sweet/i, ['#f0e1cf', '#b07a4f']],
  [/aromatic|green|herbal|fougere/i, ['#dde8d4', '#5e8a4f']],
  [/spic/i, ['#efd8cf', '#a4492f']],
  [/leather|tobacco/i, ['#e4d6c8', '#7a5232']],
  [/musk|powder/i, ['#e6e0ec', '#8a7aa3']],
];

function familyColors(families) {
  for (const f of families || []) {
    const hit = FAMILY_COLORS.find(([re]) => re.test(f));
    if (hit) return hit[1];
  }
  return null;
}

function bottle(p) {
  const palettes = [
    ['#d8dace', '#8c9d84'],
    ['#e6d6cc', '#ac806e'],
    ['#d3ddd9', '#62867d'],
    ['#e0d8c1', '#ab9564'],
    ['#e0d6db', '#a48595'],
  ];
  const [bg, liquid] = familyColors(p.families) || palettes[p.id % palettes.length];
  const name = p.name.split(' ').slice(0, 2).join(' ').toUpperCase();
  const house = (state.boot?.settings.company_name || 'Atelier').split(' ')[0].toUpperCase().slice(0, 14);
  const strength = { Parfum: 'PARFUM', EDP: 'EAU DE PARFUM', EDT: 'EAU DE TOILETTE', Cologne: 'EAU DE COLOGNE', Attar: 'ATTAR', 'Perfume Oil': 'PERFUME OIL' }[p.concentration] || 'EAU DE PARFUM';
  if (p.kind === 'service')
    return `<svg viewBox="0 0 150 170" aria-hidden="true"><rect x="25" y="30" width="100" height="125" rx="7" fill="#f9f7ed" stroke="#a5b5a3"/><path d="M45 65h60M45 80h60M45 95h35" stroke="#a5b5a3" stroke-width="3"/><path d="M65 130l12-25 26-26 10 10-26 26z" fill="#718b7b"/><text x="75" y="146" text-anchor="middle" fill="#718b7b" font-size="6">CREATIVE SERVICE</text></svg>`;
  if (p.kind === 'raw')
    return `<svg viewBox="0 0 150 170" aria-hidden="true"><rect x="47" y="12" width="56" height="22" rx="4" fill="#b9b5a9"/><path d="M48 34h54l12 17v99a9 9 0 0 1-9 9H45a9 9 0 0 1-9-9V51z" fill="${liquid}" opacity=".75"/><rect x="43" y="70" width="65" height="55" fill="#f7f5e9" rx="2"/><text x="75" y="96" text-anchor="middle" fill="#6b6c56" font-size="8">MATERIAL</text><text x="75" y="110" text-anchor="middle" fill="#6b6c56" font-size="6">${esc(p.unit.toUpperCase())}</text></svg>`;
  if (p.kind === 'packaging')
    return `<svg viewBox="0 0 150 170" aria-hidden="true"><path d="M28 48l46-22 48 22-48 22z" fill="#d8cdb9"/><path d="M28 48v88l46 24V70z" fill="#bba98e"/><path d="M74 70v90l48-24V48z" fill="#cbbda5"/><text x="71" y="112" text-anchor="middle" fill="#8b755b" font-size="7" transform="rotate(27 71 112)">PACKAGING</text></svg>`;
  return `<svg viewBox="0 0 150 170" aria-hidden="true"><rect x="56" y="7" width="38" height="29" rx="3" fill="#26362f"/><rect x="61" y="34" width="28" height="12" fill="#c5ae83"/><rect x="30" y="44" width="90" height="114" rx="12" fill="${bg}" stroke="${liquid}" stroke-width="1.5"/><rect x="36" y="53" width="78" height="96" rx="8" fill="${liquid}" opacity=".34"/><path d="M40 59v76" stroke="#fff" stroke-width="4" opacity=".3"/><rect x="38" y="81" width="74" height="47" fill="#fff" opacity=".78"/><text x="75" y="97" text-anchor="middle" fill="#596854" font-family="Georgia" font-size="6">${esc(house)}</text><text x="75" y="111" text-anchor="middle" fill="#52624f" font-size="6">${esc(name)}</text><text x="75" y="121" text-anchor="middle" fill="#87917a" font-size="4">${strength}</text></svg>`;
}

function productArt(p, extra = '') {
  const palette = ['#eeede6', '#f2e8e1', '#e9efea', '#f0ecdf', '#eee8ec'];
  return `<div class="product-art ${extra}" style="background:${palette[p.id % 5]}"><span class="category-badge">${esc(p.concentration || p.kind)}</span>${p.images.length ? `<img src="${p.images[0].url}" alt="${esc(p.images[0].alt)}" loading="lazy">` : bottle(p)}</div>`;
}

function productCard(p, pos = false) {
  return `<article class="product-card" onclick="${pos ? 'cartAdd' : 'productDetail'}(${p.id})">${productArt(p)}<div class="product-info"><h3>${esc(p.name)}</h3><div class="product-subtitle">${esc(p.size || p.sku)} · ${esc(p.audience || p.unit)}</div><div class="scent-tags">${p.families
    .slice(0, 3)
    .map(t => `<span>${esc(t)}</span>`)
    .join(
      '',
    )}</div><div class="product-bottom"><strong>${p.sales_allowed ? money(p.price_cents) + ' / ' + esc(p.unit) : 'Internal material'}</strong><span class="${p.stock_milli > 0 ? 'muted' : ''}">${p.kind === 'service' ? 'Service' : quantity(p.stock_milli) + ' in stock'}</span></div>${pos ? `<button class="subtle" onclick="event.stopPropagation();productDetail(${p.id})">Fragrance profile</button>` : ''}</div></article>`;
}

function catalogueToolbar(pos = false) {
  const f = state.filters;
  return `<div class="toolbar"><div class="search-box"><input id="catalogue-search" placeholder="Search name, inspiration, SKU or note…" value="${esc(f.search || '')}" aria-label="Search perfumes"></div><select id="filter-family" aria-label="Scent family"><option value="">All scent families</option>${selectOptions([...new Set(['Fresh', 'Citrus', 'Floral', 'Woody', 'Amber', 'Fruity', 'Aquatic', 'Gourmand', 'Aromatic', 'Leather', ...state.products.flatMap(p => p.families)])].sort(), f.family)}</select><select id="filter-audience" aria-label="Audience"><option value="">All audiences</option>${selectOptions(['Men', 'Women', 'Unisex'], f.audience)}</select><select id="filter-style" aria-label="Style"><option value="">All styles</option>${selectOptions(['French style', 'Arabian style', 'Fusion'], f.style)}</select>${!pos ? `<select id="filter-kind" aria-label="Product type"><option value="">All types</option>${selectOptions(['finished', 'raw', 'packaging', 'resale', 'service', 'intermediate'], f.kind)}</select><select id="filter-sort" aria-label="Sort products"><option value="name">Name A–Z</option><option value="price-low">Price low to high</option><option value="price-high">Price high to low</option><option value="stock">Stock quantity</option></select><div class="toggle-buttons"><button aria-label="Grid view" class="${state.view === 'grid' ? 'selected' : ''}" onclick="state.view='grid';catalogueRender()">▦</button><button aria-label="Table view" class="${state.view === 'table' ? 'selected' : ''}" onclick="state.view='table';catalogueRender()">☷</button></div>` : ''}</div>`;
}

function filteredProducts(pos = false) {
  const f = state.filters;
  return state.products
    .filter(p => p.active && (!pos || p.sales_allowed))
    .filter(
      p =>
        !f.search ||
        [
          p.name,
          p.sku,
          p.barcode,
          p.reference_name,
          p.reference_brand,
          ...p.notes,
          ...['top_notes', 'heart_notes', 'base_notes'].flatMap(k => profileFor(p)[k] || []),
          profileFor(p).smell_description || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(f.search.toLowerCase()),
    )
    .filter(p => !f.family || p.families.includes(f.family))
    .filter(p => !f.audience || p.audience === f.audience)
    .filter(p => !f.style || p.style === f.style)
    .filter(p => pos || !f.kind || p.kind === f.kind)
    .filter(p => !f.available || p.stock_milli > 0 || p.kind === 'service')
    .sort((a, b) =>
      f.sort === 'price-low'
        ? a.price_cents - b.price_cents
        : f.sort === 'price-high'
          ? b.price_cents - a.price_cents
          : f.sort === 'stock'
            ? b.stock_milli - a.stock_milli
            : a.name.localeCompare(b.name),
    );
}

function bindFilters(pos = false) {
  ['search', 'family', 'audience', 'style', 'kind', 'sort'].forEach(k => {
    const el = $('#' + (k === 'search' ? 'catalogue-search' : 'filter-' + k));
    if (!el) return;
    if (k === 'search' && pos)
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const matches = filteredProducts(true);
          if (matches.length === 1) {
            cartAdd(matches[0].id);
            el.value = '';
            state.filters.search = '';
          } else toast('Choose one matching product.');
        }
      });
    el.addEventListener(k === 'search' ? 'input' : 'change', () => {
      state.filters[k] = el.value;
      const list = filteredProducts(pos);
      $('#product-results').innerHTML =
        pos || state.view === 'grid'
          ? `<div class="catalogue">${list.map(p => productCard(p, pos)).join('') || '<div class="empty">No matching products.</div>'}</div>`
          : catalogueTable(list);
    });
  });
}

function catalogueTable(rows) {
  return table(
    ['Product', 'Classification', 'Inspiration · internal', 'Stock', 'Selling price', ''],
    rows.map(
      p =>
        `<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.sku)} · ${esc(p.kind)}</small></td><td>${p.families.map(esc).join(', ')}<small>${esc(p.style)} · ${esc(p.origin)}</small></td><td>${esc([p.reference_brand, p.reference_name].filter(Boolean).join(' · ')) || '—'}</td><td>${quantity(p.stock_milli)} ${esc(p.unit)}</td><td>${money(p.price_cents)}</td><td><button class="subtle" onclick="productDetail(${p.id})">Open →</button></td></tr>`,
    ),
  );
}

async function cataloguePage() {
  await loadLists();
  catalogueRender();
}

function catalogueRender() {
  $('#content').innerHTML =
    pageHead(
      'The perfume catalogue',
      'Find the right fragrance by scent, style or inspiration.',
      can('manager', 'warehouse')
        ? '<button class="secondary" onclick="labelsDialog()">Print labels</button><button class="secondary" onclick="libraryDialog()">Inspiration library</button><button class="primary" onclick="productDialog()">+ Add product</button>'
        : '',
    ) +
    catalogueToolbar() +
    `<p class="tiny muted">${filteredProducts().length} active products · Inspiration references are internal staff information.</p><div id="product-results">${
      state.view === 'grid'
        ? `<div class="catalogue">${filteredProducts()
            .map(p => productCard(p))
            .join('')}</div>`
        : catalogueTable(filteredProducts())
    }</div>`;
  bindFilters();
}

function referenceLabel(r) {
  return r.brand + ' · ' + r.name + (r.gender ? ' (' + r.gender + ')' : '');
}

function filterReferenceOptions(input) {
  const q = input.value.trim().toLowerCase(),
    select = input.nextElementSibling;
  let first = null;
  for (const o of select.options) {
    if (!o.value) {
      continue;
    }
    const r = state.references.find(x => String(x.id) === o.value) || {};
    const hit = !q || [r.brand, r.name, r.family, r.notes, r.gender].join(' ').toLowerCase().includes(q);
    o.hidden = !hit;
    if (hit && !first) {
      first = o;
    }
  }
  const current = select.selectedOptions[0];
  if (q && first && (!current || !current.value || current.hidden)) {
    first.selected = true;
  }
}

function referenceDialog() {
  modal(
    'Add an inspiration reference',
    `<form><div class="notice">An internal reference fragrance, separate from your own product and its origin. ${state.references.length} references are already in the library.</div><div class="form-grid">${field('Reference brand', 'brand')}${field('Reference perfume', 'name')}<label>For<select name="gender"><option value="">Unspecified</option>${selectOptions(['Men', 'Women', 'Unisex'], '')}</select></label>${field('Olfactive family', 'family')}<label class="span2">Key notes / internal notes<textarea name="notes"></textarea></label></div>${formActions('Add reference')}</form>`,
  );
  bindForm(async fd => {
    await api('references', 'POST', Object.fromEntries(fd));
    closeModal();
    toast('Reference added');
    await cataloguePage();
  });
}

function productDialog(id = null) {
  const p = state.products.find(p => p.id === id) || {
    kind: 'finished',
    unit: 'bottle',
    price_cents: 0,
    cost_cents: 0,
    tax_bp: 0,
    reorder_milli: 5000,
    families: [],
    notes: [],
    tags: [],
    active: true,
  };
  modal(
    id ? 'Edit product' : 'Create a product',
    `<form><div class="form-grid">${field('Product name', 'name', p.name)}${field('Arabic name · printed on invoices (optional)', 'name_ar', p.name_ar || '', 'text', 'dir="rtl"')}${field('SKU / internal code', 'sku', p.sku)}<label>Product type<select name="kind">${selectOptions(['finished', 'raw', 'packaging', 'resale', 'service', 'intermediate'], p.kind)}</select></label><label>Base stock unit<select name="unit">${selectOptions(['ml', 'litre', 'g', 'kg', 'piece', 'bottle', 'box', 'carton', 'hour'], p.unit)}</select></label>${field('Barcode (optional)', 'barcode', p.barcode)}${field('Size / edition', 'size', p.size)}<label>Sell individually<select name="sales_allowed"><option value="1" ${(p.sales_allowed ?? ['finished', 'resale', 'service'].includes(p.kind)) ? 'selected' : ''}>Yes · available in POS and wholesale</option><option value="0" ${(p.sales_allowed ?? ['finished', 'resale', 'service'].includes(p.kind)) ? '' : 'selected'}>No · internal material only</option></select></label>${field('Selling price per base unit', 'price', decimal(p.price_cents))}${field('Cost per base unit', 'cost', decimal(p.cost_cents))}${field('Tax % (company configured)', 'tax', decimal(p.tax_bp))}${field('Reorder quantity', 'reorder', decimal(p.reorder_milli, 3))}${field('Scent families · comma separated', 'families', p.families.join(', '))}${field('Additional notes · comma separated', 'notes', p.notes.join(', '))}${fragranceProfileFields(p)}<label>Style<select name="style"><option value="">Unspecified</option>${selectOptions(['French style', 'Arabian style', 'Fusion'], p.style)}</select></label>${field('Actual country of manufacture', 'origin', p.origin)}<label>Audience<select name="audience"><option value="">Unspecified</option>${selectOptions(['Men', 'Women', 'Unisex'], p.audience)}</select></label><label>Concentration<select name="concentration"><option value="">Unspecified</option>${selectOptions(['Parfum', 'EDP', 'EDT', 'Cologne', 'Attar', 'Perfume Oil'], p.concentration)}</select></label><label class="span2">Inspired by · internal reference<input type="search" class="reference-search" placeholder="Search ${state.references.length} references by brand, perfume or note…" oninput="filterReferenceOptions(this)" autocomplete="off"><select name="reference_id" size="1">${options(
      state.references.map(r => ({ ...r, name: referenceLabel(r) })),
      'name',
      p.reference_id,
      'No reference',
    )}</select></label>${field('Custom tags · comma separated', 'tags', p.tags.join(', '))}<label>Status<select name="active"><option value="1" ${p.active ? 'selected' : ''}>Active</option><option value="0" ${!p.active ? 'selected' : ''}>Archived</option></select></label><label class="span2">Description<textarea name="description">${esc(p.description)}</textarea></label></div><p class="form-hint">Quantities use the base unit. Changing an operational item's unit/type is restricted. Upload photos after saving.</p>${formActions('Save product')}</form>`,
    true,
  );
  bindForm(async fd => {
    const v = Object.fromEntries(fd);
    ['families', 'notes', 'tags'].forEach(
      k =>
        (v[k] = v[k]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)),
    );
    v.active = v.active === '1';
    v.sales_allowed = v.sales_allowed === '1';
    v.fragrance_profile = {};
    for (const k of ['top_notes', 'heart_notes', 'base_notes']) {
      v.fragrance_profile[k] = String(v[k] || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      delete v[k];
    }
    for (const k of ['smell_description', 'intensity', 'longevity', 'projection', 'season', 'occasion']) {
      v.fragrance_profile[k] = v[k] || '';
      delete v[k];
    }
    v.reference_id = v.reference_id ? Number(v.reference_id) : null;
    v.barcode = v.barcode || null;
    const r = await api('products' + (id ? '/' + id : ''), 'POST', v);
    closeModal();
    toast('Product saved');
    await cataloguePage();
    productDetail(r.id);
  });
}

function productDetail(id) {
  const p = state.products.find(p => p.id === id);
  const similar = state.products
    .filter(x => x.id !== id && x.kind === p.kind && x.active && x.families.some(f => p.families.includes(f)))
    .slice(0, 3);
  modal(
    p.name,
    `<div class="detail-grid"><div>${productArt(p, 'detail-art')}<div class="scent-tags" style="margin-top:15px">${p.families.map(f => `<span>${esc(f)}</span>`).join('')}</div></div><div><p class="eyebrow">${esc(p.sku)}</p><h1>${money(p.price_cents)}</h1>${[
      ['Availability', quantity(p.stock_milli) + ' ' + p.unit],
      [
        'Sales availability',
        p.sales_allowed ? 'Sell individually · ' + money(p.price_cents) + ' / ' + p.unit : 'Internal material only',
      ],
      ['Style / actual origin', [p.style, p.origin].filter(Boolean).join(' / ') || '—'],
      ['Audience / concentration', [p.audience, p.concentration].filter(Boolean).join(' / ') || '—'],
      ['Inspiration · internal', [p.reference_brand, p.reference_name].filter(Boolean).join(' · ') || '—'],
      ['Fragrance notes', p.notes.join(', ') || '—'],
      ['Cost per base unit', p.cost_cents === undefined ? 'Restricted' : money(p.cost_cents)],
    ]
      .map(([k, v]) => `<div class="detail-field"><small>${esc(k)}</small><b>${esc(v)}</b></div>`)
      .join(
        '',
      )}<p class="muted tiny">${esc(p.description)}</p></div></div>${fragranceProfileView(p)}${similar.length ? `<div class="section-label">Similar scent families</div><div class="notice">${similar.map(x => esc(x.name)).join(' · ')}<br><small>Matched by shared families; this is not a measured similarity score.</small></div>` : ''}${can('manager', 'warehouse') ? `<div class="actions">${can('manager') ? `<button class="secondary" onclick="product360(${id})">Full product history</button>` : ''}<button class="secondary" onclick="productDialog(${id})">Edit product</button><button class="primary" onclick="imageDialog(${id})">Manage images →</button></div>` : ''}`,
    true,
  );
}

function imageDialog(id) {
  const p = state.products.find(p => p.id === id);
  modal(
    'Images · ' + p.name,
    `<p class="muted">Upload product photos. The first image is used in the catalogue and POS.</p><div class="image-gallery">${p.images.map((i, n) => `<div class="image-tile"><img src="${i.url}" alt="${esc(i.alt)}"><div><button onclick="imageAction(${i.id},'cover',${id})">${n ? 'Make cover' : '✓ Cover'}</button><button onclick="imageAction(${i.id},'delete',${id})">Remove</button></div></div>`).join('')}</div><form><div class="drop-zone">JPG, PNG or WebP · up to 8 MB<br><input type="file" name="image" accept="image/jpeg,image/png,image/webp" required></div>${field('Image description', 'alt', p.name)}${formActions('Upload image')}</form>`,
  );
  bindForm(async fd => {
    await api(`products/${id}/images`, 'POST', fd);
    await loadLists();
    imageDialog(id);
    toast('Image uploaded');
  });
}

async function imageAction(id, action, product) {
  try {
    await api('images/' + id, 'POST', { action });
    await loadLists();
    imageDialog(product);
    toast(action === 'cover' ? 'Cover updated' : 'Image removed');
  } catch (e) {
    toast(e.message);
  }
}

function profileFor(p) {
  return typeof p.fragrance_profile === 'string' ? JSON.parse(p.fragrance_profile) : p.fragrance_profile || {};
}

function fragranceProfileFields(p) {
  const f = profileFor(p);
  return `<div class="span2 section-label">Fragrance profile</div>${[
    ['Top notes · opening', 'top_notes'],
    ['Middle / heart notes', 'heart_notes'],
    ['Base notes · dry-down', 'base_notes'],
  ]
    .map(([label, k]) => field(label + ' · comma separated', k, (f[k] || []).join(', ')))
    .join(
      '',
    )}<label class="span2">What does it smell like?<textarea name="smell_description" placeholder="Describe freshness, sweetness, warmth, texture and how the scent develops.">${esc(f.smell_description || '')}</textarea></label>${[
    ['Scent intensity', 'intensity'],
    ['Observed lasting time', 'longevity'],
    ['Projection / scent trail', 'projection'],
    ['Best season', 'season'],
    ['Recommended occasion', 'occasion'],
  ]
    .map(([label, k]) => field(label, k, f[k] || ''))
    .join(
      '',
    )}<p class="form-hint span2">Enter your product's own notes and tested observations. Lasting time and projection can vary with skin, weather and application.</p>`;
}

function fragranceProfileView(p) {
  if (!['finished', 'raw', 'resale', 'intermediate'].includes(p.kind)) return '';
  const f = profileFor(p);
  return `<section class="fragrance-profile"><div class="section-label">Fragrance profile</div><p class="smell-description">${esc(f.smell_description || 'Smell description not recorded yet.')}</p><div class="notes-pyramid">${[
    ['Top notes', 'First impression / opening', 'top_notes'],
    ['Middle / heart notes', 'The heart of the fragrance', 'heart_notes'],
    ['Base notes', 'The lasting dry-down', 'base_notes'],
  ]
    .map(
      ([label, help, k]) =>
        `<div class="note-layer"><h3>${label}</h3><small>${help}</small><div class="scent-tags">${(f[k] || []).length ? f[k].map(n => `<span>${esc(n)}</span>`).join('') : '<span>Not recorded</span>'}</div></div>`,
    )
    .join('')}</div><div class="profile-properties">${[
    ['Intensity', 'intensity'],
    ['Lasting time', 'longevity'],
    ['Projection / trail', 'projection'],
    ['Season', 'season'],
    ['Occasion', 'occasion'],
  ]
    .map(([label, k]) => `<div><small>${label}</small><b>${esc(f[k] || 'Not recorded')}</b></div>`)
    .join('')}</div></section>`;
}


/** Browse, import and export the internal inspiration library. */
function libraryDialog() {
  const refs = state.references;
  const own = refs.filter(r => !r.library).length;
  modal(
    `Inspiration library · ${refs.length} references`,
    `<div class="notice">Internal staff reference only: brand and perfume names are never shown to customers as an affiliation. ${refs.length - own} come with the system, ${own} were added by your team.</div>
    <div class="library-actions">${can('manager', 'warehouse') ? '<button class="primary" onclick="referenceDialog()">+ Add one</button><button class="secondary" onclick="importLibraryDialog()">Import from Excel / CSV</button>' : ''}<a class="secondary" href="/api/references/export">Export all (CSV)</a></div>
    ${table(
      ['Brand', 'Perfume', 'For', 'Family', 'Key notes'],
      refs.map(r => `<tr><td><b>${esc(r.brand)}</b></td><td>${esc(r.name)}${r.library ? '' : '<small>Added by your team</small>'}</td><td>${esc(r.gender || '—')}</td><td>${esc(r.family || '—')}</td><td><small>${esc(r.notes || '')}</small></td></tr>`),
    )}`,
    true,
  );
}

function importLibraryDialog() {
  modal(
    'Import inspiration references',
    `<form><ol class="steps"><li>Download the <a href="/api/references/export?template=1">template</a> and open it in Excel or Google Sheets.</li><li>Fill one perfume per row: <b>brand</b> and <b>name</b> are required; gender (Men / Women / Unisex), family and notes are optional.</li><li>Save as <b>CSV</b> (File → Save as → CSV UTF-8) and choose the file below.</li></ol>
    <label>CSV file<input type="file" name="file" accept=".csv,text/csv" required></label>
    <label class="check-row"><input type="checkbox" name="update" value="1" style="width:auto"> Update gender, family and notes of references that already exist</label>
    <div id="import-result"></div>${formActions('Import')}</form>`,
  );
  bindForm(async fd => {
    const body = new FormData();
    body.append('file', fd.get('file'));
    body.append('update', fd.get('update') ? '1' : '0');
    const r = await api('references/import', 'POST', body);
    state.references = (await api('references')).references;
    $('#import-result').innerHTML = `<div class="notice"><b>${r.added} added · ${r.updated} updated · ${r.skipped} already in the library</b>${r.errors.length ? `<br>${r.errors.length} row${r.errors.length === 1 ? '' : 's'} skipped:<br>${r.errors.map(e => `Row ${e.row}: ${esc(e.message)}`).join('<br>')}` : ''}</div>`;
    toast(`${r.added} references added`);
  });
}


/* ── Barcode and price labels ─────────────────────────────────────────────── */

/** Consumer price including VAT, as shown on shelves and labels in the UAE. */
function shelfPrice(p) {
  return Math.round(p.price_cents * (1 + Number(p.tax_bp || 0) / 10000));
}

function labelsDialog() {
  const products = state.products.filter(p => p.active && p.kind !== 'service');
  const missing = products.filter(p => !p.barcode).length;
  modal(
    'Print labels',
    `<form><div class="form-grid"><label>Label format<select name="format"><option value="a4">A4 sheet · 3 × 8 labels (70 × 37 mm)</option><option value="roll">Label printer · 50 × 30 mm</option></select></label>
    <div><label class="check-row"><input type="checkbox" name="price" value="1" checked style="width:auto"> Show price (incl. VAT)</label><label class="check-row"><input type="checkbox" name="arabic" value="1" checked style="width:auto"> Show Arabic name</label></div></div>
    ${missing ? `<div class="notice">${missing} product${missing === 1 ? ' has' : 's have'} no barcode. <button type="button" class="subtle" id="make-barcodes">Create in-store barcodes</button></div>` : ''}
    <div class="library-actions"><button type="button" class="secondary" data-fill="1">1 of each</button><button type="button" class="secondary" data-fill="stock">One per item in stock</button><button type="button" class="secondary" data-fill="0">Clear</button></div>
    ${table(
      ['Product', 'Barcode', 'Price incl. VAT', 'In stock', 'Copies'],
      products.map(p => `<tr><td><b>${esc(p.name)}</b><small>${esc(p.sku)}</small></td><td>${p.barcode ? esc(p.barcode) : '<span class="muted">—</span>'}</td><td>${money(shelfPrice(p))}</td><td>${quantity(p.stock_milli || 0)}</td><td><input class="label-copies" data-id="${p.id}" data-stock="${Math.max(0, Math.floor((p.stock_milli || 0) / 1000))}" inputmode="numeric" value="0" aria-label="Copies of ${esc(p.name)}"></td></tr>`),
    )}${formActions('Print labels')}</form>`,
    true,
  );
  document.querySelectorAll('[data-fill]').forEach(b =>
    b.addEventListener('click', () => document.querySelectorAll('.label-copies').forEach(i => (i.value = b.dataset.fill === 'stock' ? Math.min(200, Number(i.dataset.stock)) : b.dataset.fill))),
  );
  $('#make-barcodes')?.addEventListener('click', async () => {
    const r = await api('products/barcodes', 'POST', {});
    toast(`${r.assigned.length} barcode${r.assigned.length === 1 ? '' : 's'} created`);
    await loadLists(true);
    labelsDialog();
  });
  bindForm(async fd => {
    const copies = [...document.querySelectorAll('.label-copies')].flatMap(i => Array(Math.min(500, Math.max(0, Math.floor(Number(i.value) || 0)))).fill(Number(i.dataset.id)));
    if (!copies.length) throw new Error('Enter how many labels to print for at least one product.');
    printLabels(copies.map(id => state.products.find(p => p.id === id)), { format: fd.get('format'), price: fd.get('price') === '1', arabic: fd.get('arabic') === '1' });
  });
}

function printLabels(items, options) {
  const s = state.boot.settings;
  const a4 = options.format === 'a4';
  const label = p => `<div class="label">
      <div class="brand">${esc(s.company_name || '')}</div>
      <div class="name">${esc(p.name)}</div>
      ${options.arabic && p.name_ar ? `<div class="ar" dir="rtl">${esc(p.name_ar)}</div>` : ''}
      <div class="meta">${[p.size, p.concentration].filter(Boolean).map(esc).join(' · ')}</div>
      ${options.price && p.sales_allowed && p.price_cents > 0 ? `<div class="price">${money(shelfPrice(p))}${Number(p.tax_bp) ? '<small> incl. VAT · شامل الضريبة</small>' : ''}</div>` : ''}
      ${p.barcode ? barcodeSvg(p.barcode, { height: 34 }) : '<div class="nobar">No barcode</div>'}
    </div>`;
  const css = `
    @page { size: ${a4 ? 'A4' : '50mm 30mm'}; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, "Noto Sans Arabic", sans-serif; color: #000; }
    .sheet { ${a4 ? 'display: grid; grid-template-columns: repeat(3, 70mm); grid-auto-rows: 37.125mm; width: 210mm;' : ''} }
    .label { ${a4 ? 'width: 70mm; height: 37.125mm; padding: 2.5mm 4mm;' : 'width: 50mm; height: 30mm; padding: 1.5mm 2.5mm; page-break-after: always;'} overflow: hidden; display: flex; flex-direction: column; align-items: center; text-align: center; }
    .brand { font-size: ${a4 ? 7 : 6}pt; letter-spacing: .08em; text-transform: uppercase; color: #444; }
    .name { font-size: ${a4 ? 10 : 8}pt; font-weight: 700; line-height: 1.1; max-height: 2.2em; overflow: hidden; }
    .ar { font-size: ${a4 ? 9 : 7}pt; line-height: 1.5; margin: 0.3mm 0; }
    .meta { font-size: 6.5pt; color: #333; }
    .price { font-size: ${a4 ? 11 : 9}pt; font-weight: 700; } .price small { font-size: 6pt; font-weight: 400; }
    .barcode { width: ${a4 ? 48 : 42}mm; height: ${a4 ? 12 : 10}mm; margin-top: auto; }
    .nobar { margin-top: auto; font-size: 7pt; color: #888; }
    @media screen { body { background: #ddd; padding: 10px; } .sheet { background: #fff; margin: auto; ${a4 ? '' : 'display: flex; flex-wrap: wrap; gap: 6px; width: auto; background: none;'} } .label { ${a4 ? 'outline: 1px dashed #ccc;' : 'background: #fff; outline: 1px dashed #ccc;'} } }`;
  const w = window.open('', '_blank', a4 ? 'width=900,height=1000' : 'width=600,height=700');
  if (!w) {
    toast('Allow pop-ups for this site to print labels.');
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>${css}</style></head><body><div class="sheet">${items.map(label).join('')}</div><script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));<\/script></body></html>`);
  w.document.close();
}
