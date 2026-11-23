/* Atelier Perfume ERP · Design and packaging projects, artwork, workflow stages and customer artwork links. */
'use strict';

async function projectsPage() {
  await loadLists();
  if (can('manager')) state.batches = (await api('batches')).batches;
  state.projects = (await api('projects')).projects;
  $('#content').innerHTML =
    pageHead(
      'The creative desk',
      'Design briefs, packaging, print specifications and versioned artwork.',
      `<button class="primary" onclick="projectDialog()">+ New project</button>`,
    ) +
    `<div class="notice">Artwork approvals are recorded by authorized managers, with their identity and comments. A customer approval portal and production-order linkage are later-stage features.</div><div class="project-grid">${state.projects.map(p => `<article class="project-card" onclick="projectDetail(${p.id})"><span class="project-icon">${p.type === 'Printing' ? '▤' : p.type === 'Packaging' ? '◇' : '✧'}</span><p class="eyebrow">${esc(p.type)}</p><h3>${esc(p.name)}</h3><small class="muted">${esc(p.customer || 'Internal project')}</small><p class="brief">${esc(p.brief)}</p>${badge(p.status)}<div class="card-footer"><span>${esc(p.designer || 'Unassigned')}</span><span>Due ${p.due_date || 'not set'}</span></div></article>`).join('') || '<div class="empty">Create your first design or packaging project.</div>'}</div>`;
}

function projectDialog() {
  modal(
    'Create a creative project',
    `<form><div class="form-grid">${field('Project name', 'name')}<label>Project type<select name="type">${selectOptions(['Design', 'Printing', 'Packaging', 'Private Label'])}</select></label><label>Customer<select name="contact_id">${options(
      state.contacts.filter(c => c.kind === 'customer'),
      'name',
      '',
      'Internal project',
    )}</select></label>${field('Due date', 'due_date', '', 'date')}<label>Linked product<select name="product_id">${options(state.products, 'name', '', 'No product link')}</select></label><label>Linked production batch<select name="batch_id">${options(
      (state.batches || []).map(b => ({ ...b, name: b.number + ' · ' + b.product })),
      'name',
      '',
      'No batch link',
    )}</select></label><label>Packaging / printing vendor<select name="supplier_id">${options(
      state.contacts.filter(c => c.kind === 'supplier'),
      'name',
      '',
      'No vendor',
    )}</select></label><label>Assigned designer<select name="assigned_id">${options(state.staff || [], 'name', '', 'Unassigned')}</select></label>${field('Quoted charge', 'charge', '0.00')}${field('Estimated job cost', 'cost', '0.00')}<label class="span2">Brief<textarea name="brief" required placeholder="Customer requirements, deliverables, design direction…"></textarea></label><label class="span2">Print / packaging specification<textarea name="specification" placeholder="Dimensions, material, quantities, finishing, outsourcing…"></textarea></label></div>${formActions('Create project')}</form>`,
  );
  bindForm(async fd => {
    const v = Object.fromEntries(fd);
    v.contact_id = v.contact_id ? Number(v.contact_id) : null;
    v.due_date = v.due_date || null;
    v.assigned_id = v.assigned_id ? Number(v.assigned_id) : null;
    for (const k of ['product_id', 'batch_id', 'supplier_id']) v[k] = v[k] ? Number(v[k]) : null;
    await api('projects', 'POST', v);
    closeModal();
    toast('Project created');
    await projectsPage();
  });
}

function projectDetail(id) {
  const p = state.projects.find(p => p.id === id);
  modal(
    p.name,
    `<p>${badge(p.status)} <span class="muted tiny">${esc(p.type)} · ${esc(p.customer || 'Internal project')}</span></p><p>${esc(p.brief)}</p><div class="notice">${esc(p.specification || 'No print specifications recorded.')}</div>${p.charge_cents !== undefined ? `<div class="metric-grid"><div><small>Quoted charge</small><b>${money(p.charge_cents)}</b></div><div><small>Estimated cost</small><b>${money(p.cost_cents)}</b></div><div><small>Estimated margin</small><b>${money(p.charge_cents - p.cost_cents)}</b></div></div>` : ''}<div class="section-label">Artwork versions</div>${table(
      ['Version', 'File', 'Uploaded', ''],
      p.artworks.map(
        a =>
          `<tr><td>v${a.version} ${p.approved_artwork_id === a.id ? '✓ approved' : ''}</td><td>${esc(a.filename)}<small>${esc(a.comment)}</small></td><td>${date(a.created_at)}</td><td><a class="subtle" href="/api/artwork/${a.id}">Download ↓</a></td></tr>`,
      ),
      'Upload the first proof to begin review.',
    )}<div class="timeline">${p.approvals.map(a => `<div>${esc(a.decision)} · artwork #${a.artwork_id}<small>${a.source === 'customer' ? 'Customer: ' + esc(a.customer_name) + ' · ' + esc(a.customer_phone) + ' · ' : ''}${esc(a.comment)} · ${date(a.created_at)}</small></div>`).join('')}</div>${p.status !== 'Delivered' ? `<div class="actions">${can('manager') ? `<button class="secondary" onclick="projectLinksDialog(${id})">Link customer / product / vendor</button>` : ''}<button class="secondary" onclick="customerArtworkLink(${id})">Customer artwork link / WhatsApp</button><button class="secondary" onclick="artworkDialog(${id})">Upload mockup / revision</button>${can('manager') && p.artworks.length ? `<button class="secondary" onclick="projectApprovalDialog(${id},'revise')">Request revision</button><button class="primary" onclick="projectApprovalDialog(${id},'approve')">Approve latest artwork</button>` : ''}${can('manager') && p.status === 'Approved' ? `<button class="primary" onclick="projectApprovalDialog(${id},'deliver')">Mark delivered</button>` : ''}</div>` : ''}`,
    true,
  );
}

function artworkDialog(id) {
  modal(
    'Upload artwork revision',
    `<form><div class="drop-zone">PDF, JPG, PNG or WebP · up to 16 MB<br><input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required></div><label style="margin-top:15px">Revision comments<textarea name="comment"></textarea></label><p class="form-hint">A new upload clears active approval and requires a new review. Existing approved files remain in history. Native source files are not accepted in this build.</p>${formActions('Upload revision')}</form>`,
  );
  bindForm(async fd => {
    await api('projects/' + id + '/artwork', 'POST', fd);
    await projectsPage();
    projectDetail(id);
    toast('Artwork revision uploaded');
  });
}

function projectApprovalDialog(id, action) {
  const p = state.projects.find(p => p.id === id);
  modal(
    action === 'approve' ? 'Approve artwork' : action === 'deliver' ? 'Confirm delivery' : 'Request revision',
    `<form><div class="notice">${action === 'approve' ? 'This records your manager approval of the latest file version. Enter customer authorization evidence if approving on their behalf.' : action === 'deliver' ? 'The approved version is locked for the delivered project.' : 'Explain the required changes for the next artwork version.'}</div><label>Approval evidence / comments<textarea name="comment" required></textarea></label>${formActions('Confirm ' + action)}</form>`,
  );
  bindForm(async fd => {
    await api('projects/' + id, 'POST', { action, artwork_id: p.artworks[0]?.id, comment: fd.get('comment') });
    await projectsPage();
    projectDetail(id);
    toast('Project updated');
  });
}

const stageLabels = {
  vendor_started: 'Vendor started',
  vendor_finished: 'Vendor finished',
  packaging_ready: 'Packaging ready',
  delivered: 'Delivered',
  issue: 'Mixing started',
  mature: 'Maturation started',
  qc: 'Quality check recorded',
  complete: 'Production completed',
  recheck: 'Quality recheck',
};

function durationText(events, start, end) {
  const a = events.find(e => e.stage === start),
    b = [...events].reverse().find(e => e.stage === end);
  return a && b ? Math.max(0, (new Date(b.at) - new Date(a.at)) / 3600000).toFixed(1) + ' hours' : 'Not fully recorded';
}

function progressTimeline(p) {
  const b = p.batch,
    events = [
      { stage: 'Brief saved', at: p.created_at, notes: p.brief },
      ...(p.approvals || []).map(a => ({
        stage: 'Artwork ' + a.decision,
        at: a.created_at,
        notes:
          (a.source === 'customer' ? 'Customer ' + a.customer_name + ' · ' + a.customer_phone + ' · ' : '') +
          (a.comment || ''),
      })),
      ...(b?.workflow_events || []),
      ...(p.workflow_events || []),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));
  const ready = (p.workflow_events || []).some(e => e.stage === 'packaging_ready'),
    delivered = (p.workflow_events || []).some(e => e.stage === 'delivered');
  return `<div class="journey-strip">${[
    ['Artwork', !!p.approved_artwork_id],
    ['Production', b?.status === 'Completed'],
    ['Packaging', ready],
    ['Delivery', delivered],
  ]
    .map(
      ([label, done]) => `<span class="${done ? 'stage-done' : 'stage-pending'}">${done ? '✓' : '○'} ${label}</span>`,
    )
    .join(
      '',
    )}</div><div class="record-timeline">${events.map(e => `<div class="record-event"><span></span><div><b>${esc(stageLabels[e.stage] || e.stage)}</b><small>${date(e.at)} · ${esc(e.notes || '')}</small></div></div>`).join('')}</div>${b ? `<p class="muted">Batch ${esc(b.number)} · ${esc(b.status)} · Maturation due ${date(b.matures_at)}<br>Mixing duration: ${durationText(b.workflow_events || [], 'issue', 'mature')} · Maturation to QC: ${durationText(b.workflow_events || [], 'mature', 'qc')}</p>` : ''}<p class="muted">Vendor duration: ${durationText(p.workflow_events || [], 'vendor_started', 'vendor_finished')}</p>`;
}

function artworkGallery(project) {
  return `<div class="artwork-gallery">${(project.artworks || []).map(a => `<a class="artwork-tile" href="/api/artwork/${a.id}" target="_blank" rel="noopener">${a.mime?.startsWith('image/') ? `<img src="/api/artwork/${a.id}" alt="${esc(a.filename)}">` : '<div class="artwork-file">PDF artwork</div>'}<b>${esc(a.filename)}</b><small>Version ${a.version} · ${date(a.created_at)}${project.approved_artwork_id === a.id ? ' · Approved' : ''}</small></a>`).join('') || '<p class="muted">Artwork not uploaded yet.</p>'}</div>`;
}

function project360Panel(p) {
  return `<section class="panel dossier-project"><div class="panel-head"><div><h2>${esc(p.name)}</h2><small>${esc(p.type)} · ${badge(p.status)}</small></div><div class="actions dossier-actions"><button class="secondary" onclick="customerArtworkLink(${p.id})">Artwork link / WhatsApp</button><button class="secondary" onclick="workflowDialog(${p.id})">Record stage</button></div></div><div class="panel-body"><p>${esc(p.brief)}</p><p>Packaging specifications: ${esc(p.specification || 'Not recorded')}<br>Vendor: <b>${esc(p.supplier?.name || 'Not linked')}</b></p>${progressTimeline(p)}${artworkGallery(p)}</div></section>`;
}

function workflowDialog(id) {
  modal(
    'Record project progress',
    `<form><label>Completed stage<select name="stage">${Object.entries(stageLabels)
      .filter(([k]) => ['vendor_started', 'vendor_finished', 'packaging_ready', 'delivered'].includes(k))
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join(
        '',
      )}</select></label><label>When completed (optional)<input type="datetime-local" name="performed_at"></label><label>Notes / evidence<textarea name="notes" required placeholder="Record what was completed and any vendor reference."></textarea></label><p class="form-hint">The system records the time of this entry. Packaging needs approved artwork; delivery needs packaging ready and the linked batch completed.</p>${formActions('Save stage')}</form>`,
  );
  bindForm(async (fd, key) => {
    const v = Object.fromEntries(fd);
    if (v.performed_at) v.performed_at = new Date(v.performed_at).toISOString();
    else delete v.performed_at;
    await api('projects/' + id + '/workflow', 'POST', v, key);
    closeModal();
    toast('Stage recorded');
    if (state.currentCustomer) await customer360(state.currentCustomer);
    else await projectsPage();
  });
}

async function projectLinksDialog(id) {
  await loadLists();
  state.batches = (await api('batches')).batches;
  const p = state.projects.find(p => p.id === id) || state.customerDossier?.projects.find(p => p.id === id);
  modal(
    'Link project records',
    `<form><div class="form-grid"><label>Customer<select name="contact_id">${options(
      state.contacts.filter(c => c.kind === 'customer'),
      'name',
      p?.contact_id,
      'Internal project',
    )}</select></label><label>Product<select name="product_id">${options(state.products, 'name', p?.product_id, 'No product')}</select></label><label>Production batch<select name="batch_id">${options(
      state.batches.map(b => ({ ...b, name: b.number + ' · ' + b.product })),
      'name',
      p?.batch_id,
      'No batch',
    )}</select></label><label>Packaging / printing supplier<select name="supplier_id">${options(
      state.contacts.filter(c => c.kind === 'supplier'),
      'name',
      p?.supplier_id,
      'No supplier',
    )}</select></label></div>${formActions('Save links')}</form>`,
  );
  bindForm(async fd => {
    const v = Object.fromEntries(fd);
    for (const k in v) v[k] = v[k] ? Number(v[k]) : null;
    await api('projects/' + id + '/links', 'POST', v);
    closeModal();
    toast('Records linked');
    await projectsPage();
  });
}

async function customerProfileDialog(id) {
  const c = state.contacts.find(c => c.id === id) || state.customerDossier?.customer;
  modal(
    'Edit customer profile',
    `<form><div class="form-grid">${field('Name / company', 'name', c.name)}${field('Email', 'email', c.email, 'email')}${field('Phone with country code', 'phone', c.phone, 'tel')}<label class="span2">Address<textarea name="address">${esc(c.address)}</textarea></label></div><p class="form-hint">WhatsApp sharing uses this saved phone number. Updating it closes existing artwork links; create a fresh link afterwards.</p>${formActions('Save profile')}</form>`,
  );
  bindForm(async fd => {
    await api('contacts/' + id, 'POST', Object.fromEntries(fd));
    await loadLists();
    closeModal();
    toast('Customer profile saved');
    await customer360(id);
  });
}

async function customerArtworkLink(id) {
  try {
    const d = await api('projects/' + id + '/customer-link');
    const l = d.link;
    modal(
      'Customer artwork link',
      `<p>Share artwork for this project. The customer can review your mockup, approve the latest version or request changes.</p>${l ? `<div class="notice">${esc(l.customer)} · ${esc(l.phone)}<br>Expires ${date(l.expires_at)} · Customer uploads ${l.allow_upload ? 'enabled' : 'disabled'}</div><label>Artwork link<input id="customer-artwork-url" readonly value="${esc(l.url)}"></label><div class="actions" style="margin-top:18px"><button class="secondary" onclick="copyArtworkLink()">Copy link</button><a class="secondary" target="_blank" rel="noopener noreferrer" href="${esc(l.url)}">Preview customer page</a><a class="primary" target="_blank" rel="noopener noreferrer" href="${esc(l.whatsapp_url)}">Share on WhatsApp</a></div><p class="form-hint">Opens a prepared WhatsApp message to the saved customer number. Press Send in WhatsApp to send it.</p><button class="danger" style="margin-top:18px" onclick="manageArtworkLink(${id},'revoke')">Close this link</button>` : `<div class="notice">Link a customer and save their phone number with country code in Customer 360 first.</div><label class="checkbox"><input id="allow-customer-upload" type="checkbox" checked> Allow customer artwork uploads</label><div class="form-actions"><button class="primary" onclick="manageArtworkLink(${id},'create')">Create artwork link</button></div>`}<div id="link-error" class="error" hidden style="margin-top:15px"></div>`,
      true,
    );
  } catch (e) {
    toast(e.message);
  }
}

async function manageArtworkLink(id, action) {
  if (state.busy) return;
  state.busy = true;
  try {
    await api('projects/' + id + '/customer-link', 'POST', {
      action,
      allow_upload: $('#allow-customer-upload')?.checked ?? true,
    });
    await customerArtworkLink(id);
    toast(action === 'create' ? 'Customer artwork link created' : 'Artwork link closed');
  } catch (e) {
    $('#link-error').hidden = false;
    $('#link-error').textContent = e.message;
  } finally {
    state.busy = false;
  }
}

async function copyArtworkLink() {
  const input = $('#customer-artwork-url');
  try {
    await navigator.clipboard.writeText(input.value);
    toast('Artwork link copied');
  } catch {
    input.focus();
    input.select();
    toast('Select and copy the artwork link.');
  }
}
