/* Atelier Perfume ERP · Perfume catalogue: product cards, filters, product form, images, inspiration references and fragrance profiles. */
'use strict';

function bottle(p) {
  const palettes = [
    ['#d8dace', '#8c9d84'],
    ['#e6d6cc', '#ac806e'],
    ['#d3ddd9', '#62867d'],
    ['#e0d8c1', '#ab9564'],
    ['#e0d6db', '#a48595'],
  ];
  const [bg, liquid] = palettes[p.id % palettes.length];
  const name = p.name.split(' ').slice(0, 2).join(' ').toUpperCase();
  if (p.kind === 'service')
    return `<svg viewBox="0 0 150 170" aria-hidden="true"><rect x="25" y="30" width="100" height="125" rx="7" fill="#f9f7ed" stroke="#a5b5a3"/><path d="M45 65h60M45 80h60M45 95h35" stroke="#a5b5a3" stroke-width="3"/><path d="M65 130l12-25 26-26 10 10-26 26z" fill="#718b7b"/><text x="75" y="146" text-anchor="middle" fill="#718b7b" font-size="6">CREATIVE SERVICE</text></svg>`;
  if (p.kind === 'raw')
    return `<svg viewBox="0 0 150 170" aria-hidden="true"><rect x="47" y="12" width="56" height="22" rx="4" fill="#b9b5a9"/><path d="M48 34h54l12 17v99a9 9 0 0 1-9 9H45a9 9 0 0 1-9-9V51z" fill="${liquid}" opacity=".75"/><rect x="43" y="70" width="65" height="55" fill="#f7f5e9" rx="2"/><text x="75" y="96" text-anchor="middle" fill="#6b6c56" font-size="8">MATERIAL</text><text x="75" y="110" text-anchor="middle" fill="#6b6c56" font-size="6">${esc(p.unit.toUpperCase())}</text></svg>`;
  if (p.kind === 'packaging')
    return `<svg viewBox="0 0 150 170" aria-hidden="true"><path d="M28 48l46-22 48 22-48 22z" fill="#d8cdb9"/><path d="M28 48v88l46 24V70z" fill="#bba98e"/><path d="M74 70v90l48-24V48z" fill="#cbbda5"/><text x="71" y="112" text-anchor="middle" fill="#8b755b" font-size="7" transform="rotate(27 71 112)">PACKAGING</text></svg>`;
  return `<svg viewBox="0 0 150 170" aria-hidden="true"><rect x="56" y="7" width="38" height="29" rx="3" fill="#26362f"/><rect x="61" y="34" width="28" height="12" fill="#c5ae83"/><rect x="30" y="44" width="90" height="114" rx="12" fill="${bg}" stroke="${liquid}" stroke-width="1.5"/><rect x="36" y="53" width="78" height="96" rx="8" fill="${liquid}" opacity=".34"/><path d="M40 59v76" stroke="#fff" stroke-width="4" opacity=".3"/><rect x="38" y="81" width="74" height="47" fill="#fff" opacity=".78"/><text x="75" y="97" text-anchor="middle" fill="#596854" font-family="Georgia" font-size="6">ATELIER</text><text x="75" y="111" text-anchor="middle" fill="#52624f" font-size="6">${esc(name)}</text><text x="75" y="121" text-anchor="middle" fill="#87917a" font-size="4">EAU DE PARFUM</text></svg>`;
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
        ? '<button class="secondary" onclick="referenceDialog()">+ Inspiration reference</button><button class="primary" onclick="productDialog()">+ Add product</button>'
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
    `<form><div class="form-grid">${field('Product name', 'name', p.name)}${field('SKU / internal code', 'sku', p.sku)}<label>Product type<select name="kind">${selectOptions(['finished', 'raw', 'packaging', 'resale', 'service', 'intermediate'], p.kind)}</select></label><label>Base stock unit<select name="unit">${selectOptions(['ml', 'litre', 'g', 'kg', 'piece', 'bottle', 'box', 'carton', 'hour'], p.unit)}</select></label>${field('Barcode (optional)', 'barcode', p.barcode)}${field('Size / edition', 'size', p.size)}<label>Sell individually<select name="sales_allowed"><option value="1" ${(p.sales_allowed ?? ['finished', 'resale', 'service'].includes(p.kind)) ? 'selected' : ''}>Yes · available in POS and wholesale</option><option value="0" ${(p.sales_allowed ?? ['finished', 'resale', 'service'].includes(p.kind)) ? '' : 'selected'}>No · internal material only</option></select></label>${field('Selling price per base unit', 'price', decimal(p.price_cents))}${field('Cost per base unit', 'cost', decimal(p.cost_cents))}${field('Tax % (company configured)', 'tax', decimal(p.tax_bp))}${field('Reorder quantity', 'reorder', decimal(p.reorder_milli, 3))}${field('Scent families · comma separated', 'families', p.families.join(', '))}${field('Additional notes · comma separated', 'notes', p.notes.join(', '))}${fragranceProfileFields(p)}<label>Style<select name="style"><option value="">Unspecified</option>${selectOptions(['French style', 'Arabian style', 'Fusion'], p.style)}</select></label>${field('Actual country of manufacture', 'origin', p.origin)}<label>Audience<select name="audience"><option value="">Unspecified</option>${selectOptions(['Men', 'Women', 'Unisex'], p.audience)}</select></label><label>Concentration<select name="concentration"><option value="">Unspecified</option>${selectOptions(['Parfum', 'EDP', 'EDT', 'Cologne', 'Attar', 'Perfume Oil'], p.concentration)}</select></label><label class="span2">Inspired by · internal reference<input type="search" class="reference-search" placeholder="Search ${state.references.length} references by brand, perfume or note…" oninput="filterReferenceOptions(this)" autocomplete="off"><select name="reference_id" size="1">${options(
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
