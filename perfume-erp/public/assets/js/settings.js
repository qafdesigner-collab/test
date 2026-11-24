/* Atelier Perfume ERP · Company settings, users, locations, password and the owner System panel. */
'use strict';

async function settingsPage() {
  const s = state.boot.settings;
  let users = [];
  if (can()) users = (await api('users')).users;
  const logs = (await api('audit')).audit;
  const system = state.boot.user.role === 'owner' ? await api('system') : null;
  $('#content').innerHTML =
    pageHead(
      'Company & access',
      'Your branding, people, permissions and activity history.',
      `<button class="secondary" onclick="locationDialog()">+ Stock location</button><button class="primary" onclick="companyDialog()">Edit company</button>`,
    ) +
    panel(
      'Your installation',
      `<div class="panel-body"><div class="detail-grid"><div><h2>${esc(s.company_name)}</h2><p class="muted">${esc(s.address)}<br>${esc(s.email)} · ${esc(s.phone)}</p><small>Currency ${esc(s.currency)} · Tax ID ${esc(s.tax_id || 'not configured')}</small></div><div class="notice">Private single-company installation.<br>Local LAN operation is supported by the server. Hybrid branch syncing, electronic invoicing and terminal drivers are not enabled.</div></div></div>`,
    ) +
    (system ? systemPanel(system) : '') +
    (can()
      ? panel(
          'Team access',
          table(
            ['Name', 'Email', 'Role', 'Two-step', 'Status'],
            users.map(
              u =>
                `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.two_factor ? `${badge('On')}${state.boot.user.role === 'owner' && u.id !== state.boot.user.id ? ` <button class="subtle" onclick="resetTwoFactor(${u.id},'${esc(u.name).replace(/'/g, '&#39;')}')">Reset</button>` : ''}` : '<span class="muted">Off</span>'}</td><td>${badge(u.active ? 'Active' : 'Disabled')} ${u.id !== state.boot.user.id ? `<button class="subtle" onclick="toggleUser(${u.id},${!u.active})">${u.active ? 'Disable' : 'Enable'}</button>` : ''}</td></tr>`,
            ),
          ),
          '<button class="subtle" onclick="userDialog()">+ Invite / create user</button>',
        )
      : '') +
    panel(
      'Recent activity',
      table(
        ['Time', 'User', 'Action', 'Record'],
        logs.map(
          l =>
            `<tr><td>${date(l.created_at)}</td><td>${esc(l.user || 'System')}</td><td>${esc(l.action)}</td><td>${esc(l.subject)}</td></tr>`,
        ),
      ),
    );
}

const BRAND_COLORS = [
  ['Emerald', '#087b61'], ['Navy', '#1f3a5f'], ['Burgundy', '#8a2c3b'], ['Plum', '#5b3a78'],
  ['Teal', '#0f6c7a'], ['Charcoal', '#2f3a40'], ['Bronze', '#7d5310'], ['Rose', '#9c3563'],
];

/** WCAG contrast of white text on a hex colour. */
function contrastWithWhite(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (lum + 0.05);
}

function companyDialog() {
  const s = state.boot.settings;
  const current = s.brand_color || '#087b61';
  modal(
    'Company details',
    `<form><div class="form-grid">${field('Company name', 'company_name', s.company_name)}${field('Email', 'email', s.email, 'email')}${field('Phone', 'phone', s.phone)}${field('TRN · tax registration number', 'tax_id', s.tax_id)}<label>VAT registered<select name="vat_registered">${selectOptions(['0', '1'], s.vat_registered === '1' ? '1' : '0').replace('>0<', '>No · plain invoices<').replace('>1<', '>Yes · tax invoices with VAT summary<')}</select></label>${field('Company name in Arabic', 'company_name_ar', s.company_name_ar || '', 'text', 'dir="rtl"')}<label>Customer loyalty points<select name="loyalty_enabled"><option value="0" ${s.loyalty_enabled !== '1' ? 'selected' : ''}>Off</option><option value="1" ${s.loyalty_enabled === '1' ? 'selected' : ''}>On · customers earn and redeem points</option></select></label>${field('Points earned per AED 1', 'loyalty_points_per_aed', s.loyalty_points_per_aed ?? '1')}${field('Value of one point in fils (5 = 100 points worth AED 5)', 'loyalty_point_value_fils', s.loyalty_point_value_fils ?? '5')}<label>Stock leaves in this order<select name="stock_issue_order"><option value="fifo" ${s.stock_issue_order !== 'fefo' ? 'selected' : ''}>FIFO · oldest stock first</option><option value="fefo" ${s.stock_issue_order === 'fefo' ? 'selected' : ''}>FEFO · earliest expiry first, never expired stock</option></select></label><label class="span2">Address in Arabic<textarea name="address_ar" dir="rtl">${esc(s.address_ar || '')}</textarea></label>${''}${field('Currency · three-letter code', 'currency', s.currency)}<label class="span2">Address<textarea name="address">${esc(s.address)}</textarea></label>
    <div class="span2"><div class="section-label">Logo</div><div class="logo-preview">${s.logo_path ? `<img src="${logoUrl()}" alt="Current logo">` : '<span class="muted">No logo yet. The letter mark is used.</span>'}<label class="secondary file-button">Upload PNG, JPG or WebP (max 2 MB)<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" hidden></label>${s.logo_path ? '<button type="button" class="subtle" id="logo-remove">Remove</button>' : ''}</div></div>
    <div class="span2"><div class="section-label">Sign-in page photo</div><div class="logo-preview login-photo-preview">${s.login_image_path ? `<img src="/media/login-image?v=${encodeURIComponent(s.login_image_path.slice(-16, -4))}" alt="Current sign-in photo">` : '<span class="muted">No photo yet. The bottle illustration is shown.</span>'}<label class="secondary file-button">Upload a photo (JPG, PNG or WebP, max 8 MB)<input type="file" id="login-photo-file" accept="image/png,image/jpeg,image/webp" hidden></label>${s.login_image_path ? '<button type="button" class="subtle" id="login-photo-remove">Remove</button>' : ''}</div><p class="form-hint">Shown large on the sign-in page, for example your shop, your bottles or a campaign photo. Use photos you own.</p></div>
    <div class="span2"><div class="section-label">Brand colour</div><div class="color-row">${BRAND_COLORS.map(([name, hex]) => `<button type="button" class="color-swatch ${hex === current ? 'is-selected' : ''}" style="background:${hex}" title="${name}" aria-label="${name}" data-color="${hex}"></button>`).join('')}<label class="tiny">Custom <input type="color" id="brand-custom" value="${current}" style="width:44px;height:32px;padding:0;border:0"></label><input type="hidden" name="brand_color" value="${current}"></div><p class="form-hint">Used for buttons, the menu and charts. Dark colours keep white text readable.</p></div>
    <label class="span2">Printed invoice footer · thank-you note, bank details or terms<textarea name="invoice_footer" maxlength="500">${esc(s.invoice_footer || '')}</textarea></label></div>${formActions('Save company')}</form>`,
  );
  const colorInput = $('.modal input[name=brand_color]');
  const pick = hex => {
    colorInput.value = hex;
    document.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('is-selected', b.dataset.color === hex));
    document.documentElement.style.setProperty('--accent', hex);
  };
  document.querySelectorAll('.color-swatch').forEach(b => b.addEventListener('click', () => pick(b.dataset.color)));
  $('#brand-custom').addEventListener('input', e => pick(e.target.value));
  $('#logo-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    try {
      await api('settings/logo', 'POST', fd);
      state.boot = await api('bootstrap');
      companyHeader();
      toast('Logo updated');
      companyDialog();
    } catch (err) {
      $('#form-error').textContent = err.message;
      $('#form-error').hidden = false;
    }
  });
  $('#login-photo-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      await api('settings/login-image', 'POST', fd);
      state.boot = await api('bootstrap');
      toast('Sign-in photo updated');
      companyDialog();
    } catch (err) {
      $('#form-error').textContent = err.message;
      $('#form-error').hidden = false;
    }
  });
  $('#login-photo-remove')?.addEventListener('click', async () => {
    await api('settings/login-image', 'POST', { remove: true });
    state.boot = await api('bootstrap');
    toast('Sign-in photo removed');
    companyDialog();
  });
  $('#logo-remove')?.addEventListener('click', async () => {
    await api('settings/logo', 'POST', { remove: true });
    state.boot = await api('bootstrap');
    companyHeader();
    toast('Logo removed');
    companyDialog();
  });
  bindForm(async fd => {
    const values = Object.fromEntries(fd);
    if (contrastWithWhite(values.brand_color) < 4.5) {
      throw new Error('That brand colour is too light for white button text. Choose a darker shade.');
    }
    await api('settings', 'POST', values);
    state.boot = await api('bootstrap');
    companyHeader();
    closeModal();
    toast('Company updated');
    await settingsPage();
  });
}

function userDialog() {
  modal(
    'Create team access',
    `<form><div class="form-grid">${field('Full name', 'name')}${field('Email address', 'email', '', 'email')}${field('Initial password · at least 12 characters', 'password', '', 'password')}<label>Role<select name="role">${selectOptions(['manager', 'warehouse', 'production', 'cashier', 'designer', 'accountant', 'owner'])}</select></label></div><p class="form-hint">Share credentials securely. Users can change their password from their profile. Only owners create accounts.</p>${formActions('Create account')}</form>`,
  );
  bindForm(async fd => {
    await api('users', 'POST', Object.fromEntries(fd));
    closeModal();
    toast('User created');
    await settingsPage();
  });
}

async function toggleUser(id, active) {
  try {
    await api('users/' + id, 'POST', { active });
    toast('User access updated');
    await settingsPage();
  } catch (e) {
    toast(e.message);
  }
}

function locationDialog() {
  modal(
    'Add stock location',
    `<form>${field('Location name', 'name')}<label style="margin-top:15px">Type<select name="kind">${selectOptions(['warehouse', 'shop'])}</select></label>${formActions('Create location')}</form>`,
  );
  bindForm(async fd => {
    await api('locations', 'POST', Object.fromEntries(fd));
    location.reload();
  });
}

async function passwordDialog() {
  let tf = { available: false };
  try {
    tf = await api('two-factor');
  } catch (e) {}
  const twoStep = !tf.available
    ? ''
    : `<section class="two-step-box"><h3>Two-step sign-in</h3>${
        tf.enabled
          ? `<p>${badge('On')} Recovery codes left: <b>${tf.recovery_remaining}</b></p><p class="form-hint">Each sign-in asks for a code from your authenticator app.</p><div class="form-actions"><button type="button" class="secondary" onclick="twoFactorPasswordDialog('recovery')">New recovery codes</button><button type="button" class="subtle" onclick="twoFactorPasswordDialog('disable')">Switch off</button></div>`
          : '<p class="form-hint">Protect your account with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).</p><div class="form-actions"><button type="button" class="primary" onclick="twoFactorPasswordDialog(\'setup\')">Set up two-step sign-in</button></div>'
      }</section>`;
  modal(
    'Your account',
    `<form><h3>Change your password</h3>${field('Current password', 'current_password', '', 'password')}${field('New password · at least 12 characters', 'password', '', 'password')}${field('Confirm new password', 'password_confirmation', '', 'password')}${formActions('Change password')}</form>${twoStep}`,
  );
  bindForm(async fd => {
    await api('password', 'POST', Object.fromEntries(fd));
    closeModal();
    toast('Password changed');
  });
}

/** Loads the QR code library only when someone sets up two-step sign-in. */
function loadQrLibrary() {
  if (typeof qrcode === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/assets/js/vendor/qrcode.js?v=' + encodeURIComponent(state.boot.build);
    script.onload = resolve;
    script.onerror = () => reject(new Error('The QR code could not be loaded. Type the key into your app instead.'));
    document.head.appendChild(script);
  });
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
}

function twoFactorPasswordDialog(action) {
  const titles = { setup: 'Set up two-step sign-in', recovery: 'New recovery codes', disable: 'Switch off two-step sign-in' };
  const notes = {
    setup: 'Confirm your password to start.',
    recovery: 'Your old recovery codes will stop working.',
    disable: 'Your account will only be protected by your password.',
  };
  modal(titles[action], `<form><p class="form-hint">${notes[action]}</p>${field('Current password', 'password', '', 'password')}${formActions('Continue')}</form>`);
  bindForm(async fd => {
    const result = await api('two-factor', 'POST', { action, password: fd.get('password') });
    if (action === 'setup') return twoFactorSetupDialog(result);
    if (action === 'recovery') return recoveryCodesDialog(result.recovery_codes);
    closeModal();
    toast('Two-step sign-in switched off');
  });
}

async function twoFactorSetupDialog(setup) {
  let qr = '';
  try {
    await loadQrLibrary();
    qr = `<div class="qr-box" data-no-translate>${qrSvg(setup.uri)}</div>`;
  } catch (e) {
    qr = `<p class="error">${esc(e.message)}</p>`;
  }
  const key = setup.secret.replace(/(.{4})/g, '$1 ').trim();
  modal(
    'Set up two-step sign-in',
    `<form><ol class="setup-steps"><li>Open your authenticator app and scan this QR code.</li><li>Or type this key: <code class="secret-key" data-no-translate>${esc(key)}</code></li><li>Enter the 6-digit code the app shows.</li></ol>${qr}${field('6-digit code', 'code')}${formActions('Switch on')}</form>`,
  );
  const input = $('.modal input[name="code"]');
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'one-time-code');
  input.focus();
  bindForm(async fd => {
    const result = await api('two-factor', 'POST', { action: 'confirm', code: fd.get('code') });
    toast('Two-step sign-in switched on');
    recoveryCodesDialog(result.recovery_codes);
  });
}

function recoveryCodesDialog(codes) {
  modal(
    'Recovery codes',
    `<p class="notice">Keep these codes somewhere safe. Each one signs you in once if you lose your phone. They are shown only now.</p><ol class="recovery-codes" data-no-translate>${codes.map(c => `<li><code>${esc(c)}</code></li>`).join('')}</ol><div class="form-actions"><button type="button" class="secondary" onclick="copyRecoveryCodes()">Copy</button><button type="button" class="secondary" onclick="window.print()">Print</button><button type="button" class="primary" onclick="closeModal()">I have saved them</button></div>`,
  );
}

async function copyRecoveryCodes() {
  const text = [...document.querySelectorAll('.recovery-codes code')].map(c => c.textContent).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch (e) {
    toast('Copy is not available. Write the codes down or print them.');
  }
}

async function resetTwoFactor(id, name) {
  const question = state.lang === 'ar' ? `إيقاف التحقق بخطوتين لـ ${name}؟ يمكنه إعداده مجددًا بعد تسجيل الدخول.` : `Switch off two-step sign-in for ${name}? They can set it up again after signing in.`;
  if (!confirm(question)) return;
  try {
    await api('users/' + id + '/two-factor-reset', 'POST', {});
    toast('Two-step sign-in reset');
    await settingsPage();
  } catch (e) {
    toast(e.message);
  }
}

function systemPanel(x) {
  const pending = x.pending_updates.length;
  const backups = x.backups.length
    ? table(
        ['Automatic backup', 'Size', 'Created'],
        x.backups.map(
          b => `<tr><td>${esc(b.name)}</td><td>${fileSize(b.bytes)}</td><td>${date(b.created_at)}</td></tr>`,
        ),
      )
    : '<p class="muted">No automatic backups yet. Add the daily cron job shown above in cPanel → Cron Jobs.</p>';
  return panel(
    'System · updates and backups',
    `<div class="panel-body"><div class="detail-grid"><div><p><b>Version</b> ${esc(x.version)}<br><b>Database</b> ${esc(x.database === 'sqlite' ? 'SQLite file' : 'MySQL / MariaDB')}<br><b>PHP</b> ${esc(x.php)}</p>${pending ? `<div class="notice"><b>${pending} database update${pending > 1 ? 's' : ''} waiting.</b> New program files were uploaded. Back up first, then apply the update.</div>` : '<p class="muted">The database is up to date.</p>'}</div><div><p class="form-hint">Daily automatic backup (cPanel → Cron Jobs → once per day):</p><pre class="cron-line">php ${esc(x.artisan)} erp:backup-auto</pre><p class="tiny muted">Keeps the newest 14 backups in perfume-erp/storage/app/backups. Also keep cPanel's own backups switched on.</p></div></div>${backups}</div>`,
    `<button class="secondary" onclick="systemPasswordDialog('backup')">Download backup now</button><button class="secondary" onclick="uploadUpdateDialog()">Upload update</button>${pending ? '<button class="primary" onclick="systemPasswordDialog(\'update\')">Apply update</button>' : ''}`,
  );
}

function systemPasswordDialog(action) {
  const update = action === 'update';
  modal(
    update ? 'Apply database update' : 'Download a backup',
    `<form><div class="notice">${update ? 'Download a backup first. Updates change the database structure and cannot be undone from here.' : 'The backup contains all business data and private files. It is not encrypted: store it somewhere safe.'}</div><label>Confirm with your password<input name="password" type="password" required autocomplete="current-password"></label>${formActions(update ? 'Apply update' : 'Create and download')}</form>`,
  );
  bindForm(async fd => {
    const password = fd.get('password');
    if (update) {
      const r = await api('system/update', 'POST', { password });
      closeModal();
      toast(r.applied.length ? `Applied ${r.applied.length} update(s).` : 'Nothing to update.');
      await settingsPage();
      return;
    }
    const response = await fetch('/api/system/backup', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': $('meta[name="csrf-token"]').content,
        'X-Locale': state.lang,
      },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.errors?.password?.[0] || body.message || 'Backup failed.');
    }
    const blob = await response.blob();
    const name =
      (response.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)/)?.[1] || 'atelier-erp-backup.zip';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    closeModal();
    toast('Backup downloaded. Store it securely.');
  });
}

/** Install a new atelier-erp-cpanel ZIP from the browser: upload in 1 MB pieces, install, then update the database. */
function uploadUpdateDialog() {
  modal(
    'Upload update',
    `<form><p class="form-hint">Choose the new <b>atelier-erp-cpanel-….zip</b> file you received. A backup is saved on the server first, then the new files are installed. Your settings, data and uploads are kept.</p>
    <label>Update package (ZIP)<input type="file" name="package" accept=".zip,application/zip" required></label>${field('Your password', 'password', '', 'password')}
    <div class="update-progress" hidden><div class="update-bar"><i></i></div><small id="update-status"></small></div>${formActions('Install update')}</form>`,
  );
  bindForm(async fd => {
    const file = fd.get('package');
    const password = fd.get('password');
    const status = text => ($('#update-status').textContent = text);
    $('.update-progress').hidden = false;
    status('Checking your password…');
    const start = await api('system/package', 'POST', { action: 'start', password, size: file.size });
    try {
      const parts = Math.ceil(file.size / start.chunk_size);
      for (let i = 0; i < parts; i++) {
        const body = new FormData();
        body.append('action', 'chunk');
        body.append('id', start.id);
        body.append('index', String(i));
        body.append('chunk', file.slice(i * start.chunk_size, (i + 1) * start.chunk_size), 'part');
        await api('system/package', 'POST', body);
        $('.update-bar i').style.width = Math.round(((i + 1) / parts) * 100) + '%';
        status(`Uploading… ${Math.round(((i + 1) / parts) * 100)}%`);
      }
    } catch (e) {
      await api('system/package', 'POST', { action: 'cancel', id: start.id }).catch(() => {});
      throw e;
    }
    status('Saving a backup and installing the new files…');
    const done = await api('system/package', 'POST', { action: 'finish', id: start.id });
    status('Updating the database…');
    const system = await api('system');
    if (system.pending_updates.length) await api('system/update', 'POST', { password });
    status(`Updated from ${done.from} to ${done.version}. Reloading…`);
    toast(`Updated to ${done.version}`);
    setTimeout(() => location.reload(), 1500);
  });
}
