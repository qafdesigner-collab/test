'use strict';
const base = location.pathname.replace(/\/$/, ''),
  root = document.querySelector('#review');
const escapeReview = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let reviewData,
  customerName = '',
  customerPhone = '',
  submitting = false;
async function reviewApi(path, method = 'GET', data) {
  const r = await fetch(base + '/' + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(method === 'POST'
        ? {
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
            ...(!(data instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          }
        : {}),
    },
    body: method === 'POST' ? (data instanceof FormData ? data : JSON.stringify(data)) : undefined,
  });
  const body = await r
    .json()
    .catch(() => ({ message: 'This artwork link is unavailable. Please contact the studio.' }));
  if (!r.ok)
    throw Error(
      body.errors ? Object.values(body.errors).flat().join(' ') : body.message || 'The request could not be completed.',
    );
  return body;
}
function identityFields() {
  return `<div class="grid"><label>Your full name<input name="name" autocomplete="name" required maxlength="150" value="${escapeReview(customerName)}"></label><label>Registered phone number<input name="phone" type="tel" autocomplete="tel" required maxlength="40" placeholder="+971501234567" value="${escapeReview(customerPhone)}"></label></div><p class="muted">Use the number registered with the studio, including its country code.</p>`;
}
async function loadReview(message = '') {
  reviewData = await reviewApi('data');
  const d = reviewData,
    a = d.artworks[0],
    locked = d.project.status === 'Delivered',
    approved = a && Number(d.project.approved_artwork_id) === a.id;
  root.innerHTML = `<header><div class="eyebrow">${escapeReview(d.company || 'ARTWORK STUDIO')}</div><h1>${escapeReview(d.project.name)}</h1><p class="muted">Upload your artwork or review the latest mockup.</p><span class="badge">${escapeReview(d.project.status)}</span></header><div id="message" role="status" aria-live="polite">${message ? `<div class="success">${escapeReview(message)}</div>` : ''}</div><section class="card"><h2>${a ? 'Latest artwork · Version ' + a.version : 'Waiting for the first artwork'}</h2>${a ? `<p>${escapeReview(a.filename)} · ${a.source === 'customer' ? 'Customer upload' : 'Studio mockup'}</p><div class="preview">${a.mime === 'application/pdf' ? `<iframe title="Artwork version ${a.version}" src="${base}/files/${a.id}"></iframe>` : `<img alt="Artwork version ${a.version}" src="${base}/files/${a.id}">`}</div><div class="actions"><a class="button secondary" target="_blank" rel="noopener noreferrer" href="${base}/files/${a.id}">Open / download artwork</a><button class="secondary" id="print-artwork">Print review</button></div>${approved ? '<div class="success">This artwork version has been approved.</div>' : ''}` : '<p class="muted">The studio can add a mockup, or you can upload your artwork below.</p>'}</section>${a && !locked && !approved ? `<section class="card"><h2>Review version ${a.version}</h2><form id="decision-form">${identityFields()}<label>Comments / requested changes<textarea name="comment" maxlength="2000"></textarea></label><label class="consent"><input type="checkbox" name="consent" required><span>I have reviewed version ${a.version}. I authorize the decision submitted below for this artwork.</span></label><div class="actions"><button name="decision" value="approve">Approve version ${a.version}</button><button class="secondary" name="decision" value="revise">Request changes</button></div></form></section>` : ''}${d.allow_upload ? `<section class="card"><h2>Upload your artwork</h2><form id="upload-form">${identityFields()}<label>Artwork file · PDF, JPG, PNG or WebP · up to 16 MB<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required></label><label>Instructions for the studio<textarea name="comment" maxlength="2000"></textarea></label><p class="muted">A new upload creates the next version and requires a fresh approval.</p><button>Upload artwork</button></form></section>` : ''}${
    d.artworks.length > 1
      ? `<section class="card"><h2>Earlier versions</h2><div class="history">${d.artworks
          .slice(1)
          .map(
            x =>
              `<a target="_blank" rel="noopener noreferrer" href="${base}/files/${x.id}">Version ${x.version} · ${escapeReview(x.filename)}</a>`,
          )
          .join('')}</div></section>`
      : ''
  }<p class="muted">Link expires ${escapeReview(new Date(d.expires_at).toLocaleDateString())}.</p>`;
  document.querySelector('#print-artwork')?.addEventListener('click', () => window.print());
  for (const id of ['decision-form', 'upload-form'])
    document.getElementById(id)?.addEventListener('submit', async e => {
      e.preventDefault();
      if (submitting) return;
      submitting = true;
      const form = e.currentTarget,
        fd = new FormData(form);
      customerName = String(fd.get('name'));
      customerPhone = String(fd.get('phone'));
      form.querySelectorAll('button').forEach(b => (b.disabled = true));
      try {
        if (id === 'upload-form') {
          const f = fd.get('file');
          if (f.size > 16 * 1024 * 1024) throw Error('Choose an artwork file smaller than 16 MB.');
          await reviewApi('upload', 'POST', fd);
          await loadReview('Your artwork was uploaded. The studio will see the new version.');
        } else {
          const decision = e.submitter.value;
          await reviewApi('decision', 'POST', { ...Object.fromEntries(fd), decision, artwork_id: a.id, consent: true });
          await loadReview(
            decision === 'approve'
              ? 'Your approval has been recorded for version ' + a.version + '.'
              : 'Your requested changes have been recorded.',
          );
        }
      } catch (err) {
        const m = document.querySelector('#message');
        m.innerHTML = `<div class="error">${escapeReview(err.message)}</div>`;
        m.scrollIntoView({ behavior: 'smooth', block: 'center' });
        form.querySelectorAll('button').forEach(b => (b.disabled = false));
      } finally {
        submitting = false;
      }
    });
}
loadReview().catch(e => {
  root.innerHTML = `<section class="card"><h1>Artwork link unavailable</h1><p>${escapeReview(e.message)}</p><p class="muted">Ask the studio for a fresh link.</p></section>`;
});
