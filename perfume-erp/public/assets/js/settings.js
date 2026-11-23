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
      `<div class="panel-body"><div class="detail-grid"><div><h2>${esc(s.company_name)}</h2><p class="muted">${esc(s.address)}<br>${esc(s.email)} · ${esc(s.phone)}</p><small>Currency ${esc(s.currency)} · Tax ID ${esc(s.tax_id || 'not configured')}</small></div><div class="notice">Private single-company installation.<br>Development release ${esc(state.boot.build)}.<br>Local LAN operation is supported by the server. Hybrid branch syncing, electronic invoicing, Arabic and terminal drivers are not enabled.</div></div></div>`,
    ) +
    (system ? systemPanel(system) : '') +
    (can()
      ? panel(
          'Team access',
          table(
            ['Name', 'Email', 'Role', 'Status'],
            users.map(
              u =>
                `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${badge(u.active ? 'Active' : 'Disabled')} ${u.id !== state.boot.user.id ? `<button class="subtle" onclick="toggleUser(${u.id},${!u.active})">${u.active ? 'Disable' : 'Enable'}</button>` : ''}</td></tr>`,
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

function companyDialog() {
  const s = state.boot.settings;
  modal(
    'Company details',
    `<form><div class="form-grid">${field('Company name', 'company_name', s.company_name)}${field('Email', 'email', s.email, 'email')}${field('Phone', 'phone', s.phone)}${field('Tax identifier', 'tax_id', s.tax_id)}${field('Currency · three-letter code', 'currency', s.currency)}<label class="span2">Address<textarea name="address">${esc(s.address)}</textarea></label></div>${formActions('Save company')}</form>`,
  );
  bindForm(async fd => {
    await api('settings', 'POST', Object.fromEntries(fd));
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

function passwordDialog() {
  modal(
    'Change your password',
    `<form>${field('Current password', 'current_password', '', 'password')}${field('New password · at least 12 characters', 'password', '', 'password')}${field('Confirm new password', 'password_confirmation', '', 'password')}${formActions('Change password')}</form>`,
  );
  bindForm(async fd => {
    await api('password', 'POST', Object.fromEntries(fd));
    closeModal();
    toast('Password changed');
  });
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
    `<button class="secondary" onclick="systemPasswordDialog('backup')">Download backup now</button>${pending ? '<button class="primary" onclick="systemPasswordDialog(\'update\')">Apply update</button>' : ''}`,
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
