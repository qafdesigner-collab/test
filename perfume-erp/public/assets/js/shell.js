/* Atelier Perfume ERP · Navigation drawer, page routing and start-up. */
'use strict';

const navItems = [
  ['customers', '◎', 'Customer 360', ['manager']],
  ['dashboard', '◫', 'Overview', ['manager', 'accountant', 'warehouse', 'production', 'cashier', 'designer']],
  ['catalogue', '◇', 'Perfume catalogue', ['manager', 'accountant', 'warehouse', 'production', 'cashier', 'designer']],
  ['library', '❦', 'Inspiration library', ['manager', 'warehouse', 'production', 'cashier']],
  ['inventory', '▤', 'Inventory', ['manager', 'warehouse', 'production', 'accountant']],
  ['wholesale', '↗', 'Wholesale & invoices', ['manager', 'accountant', 'warehouse']],
  ['purchasing', '↓', 'Purchasing', ['manager', 'accountant', 'warehouse']],
  ['pos', '▦', 'Point of sale', ['manager', 'cashier']],
  ['production', '⌘', 'Manufacturing', ['manager', 'production', 'warehouse']],
  ['formulas', '⚗', 'Secret formulas', ['manager', 'production']],
  ['projects', '✧', 'Design & packaging', ['manager', 'designer']],
  ['reports', '▥', 'Reports', ['manager', 'accountant']],
  ['profit', '◎', 'Profit & loss', ['manager', 'accountant']],
  ['expenses', '◈', 'Expenses', ['manager', 'accountant']],
  ['settings', '⚙', 'Company & access', ['manager']],
];

/** Thin line icons for the menu (24 × 24, drawn with the text colour). */
const NAV_ICONS = {
  customers: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5"/>',
  dashboard: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="4.5" rx="1.5"/><rect x="13" y="10.5" width="7" height="9.5" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/>',
  catalogue: '<path d="M10 3.5h4v3h-4z"/><path d="M8.5 6.5h7l1.5 3v9.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19V9.5z"/><path d="M9.5 13h5"/>',
  library: '<path d="M4 5.5c2.7-1 5.3-1 8 .8 2.7-1.8 5.3-1.8 8-.8v13c-2.7-1-5.3-1-8 .8-2.7-1.8-5.3-1.8-8-.8z"/><path d="M12 6.3v13"/>',
  inventory: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  wholesale: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6"/>',
  purchasing: '<path d="M3.5 6.5h10v9h-10zM13.5 9.5h4l3 3v3h-7"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  pos: '<path d="M5 8h14l-1.2 11.5H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  production: '<path d="M10 3.5v6L5 18.5a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9.5v-6M8.5 3.5h7M7.5 15h9"/>',
  formulas: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>',
  projects: '<path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="M14 7.5l3 3"/>',
  reports: '<path d="M4 20h16M7 16.5V11M11.5 16.5V6.5M16 16.5V9"/>',
  profit: '<path d="M4 17l5.5-5.5 3.5 3.5 7-7"/><path d="M15 8h5v5"/>',
  expenses: '<rect x="3.5" y="6" width="17" height="12.5" rx="2"/><path d="M3.5 10h17M15.5 14.5h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6"/>',
};

function navIcon(key) {
  return `<svg class="nav-svg" viewBox="0 0 24 24" aria-hidden="true">${NAV_ICONS[key] || ''}</svg>`;
}

const tabletNavigation = window.matchMedia('(max-width: 1180px)');

function setNavigationOpen(open, restoreFocus = false) {
  const drawer = tabletNavigation.matches && open;
  document.body.classList.toggle('nav-open', drawer);
  $('.mobile-menu')?.setAttribute('aria-expanded', String(drawer));
  $('.sidebar').inert = tabletNavigation.matches && !drawer;
  $('.navigation-backdrop').hidden = !drawer;
  $('.app-main').inert = drawer;
  if (drawer) $('.sidebar .nav-item.active,.sidebar .nav-item')?.focus({ preventScroll: true });
  else if (restoreFocus) $('.mobile-menu')?.focus({ preventScroll: true });
}

function setupNavigation() {
  const sidebar = $('.sidebar'),
    button = $('.mobile-menu');
  sidebar.id = 'app-navigation';
  button.removeAttribute('onclick');
  button.setAttribute('aria-controls', sidebar.id);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Open navigation');
  const backdrop = document.createElement('button');
  backdrop.className = 'navigation-backdrop';
  backdrop.type = 'button';
  backdrop.hidden = true;
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', 'Close navigation');
  document.body.append(backdrop);
  const close = document.createElement('button');
  close.className = 'navigation-close icon-button';
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close navigation');
  sidebar.prepend(close);
  button.addEventListener('click', () => setNavigationOpen(!document.body.classList.contains('nav-open')));
  backdrop.addEventListener('click', () => setNavigationOpen(false, true));
  close.addEventListener('click', () => setNavigationOpen(false, true));
  $('#navigation').addEventListener('click', e => {
    if (e.target.closest('a.nav-item')) setNavigationOpen(false, true);
  });
  tabletNavigation.addEventListener('change', () => setNavigationOpen(false));
  document.addEventListener('keydown', e => {
    if (!document.body.classList.contains('nav-open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setNavigationOpen(false, true);
    }
    if (e.key === 'Tab') {
      const focus = [...sidebar.querySelectorAll('a[href],button')].filter(x => !x.disabled && x.offsetParent !== null);
      const first = focus[0],
        last = focus.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  setNavigationOpen(false);
}

function navigation() {
  const page = location.hash.slice(1) || 'dashboard';
  $('#navigation').innerHTML = navItems
    .filter(x => can(...x[3]))
    .map(
      (x, i) =>
        `${x[0] === 'reports' ? '<div class="nav-separator"></div>' : ''}<a class="nav-item ${page === x[0] ? 'active' : ''}" href="#${x[0]}"><span class="nav-icon">${navIcon(x[0])}</span>${x[2]}</a>`,
    )
    .join('');
}

async function render() {
  navigation();
  setNavigationOpen(false);
  const page = location.hash.slice(1) || 'dashboard';
  const item = navItems.find(x => x[0] === page);
  if (!item || !can(...item[3])) {
    $('#content').innerHTML = '<div class="empty">You do not have access to this page.</div>';
    return;
  }
  $('#content').innerHTML = '<div class="loading"><span class="spinner"></span>Loading…</div>';
  try {
    await {
      customers: customersPage,
      dashboard: dashboardPage,
      catalogue: cataloguePage,
      library: libraryPage,
      inventory: inventoryPage,
      wholesale: () => documentsPage(false),
      purchasing: () => documentsPage(true),
      pos: posPage,
      production: productionPage,
      formulas: formulaPage,
      projects: projectsPage,
      reports: reportsPage,
      expenses: () => expensesPage(),
      profit: () => profitLossPage(),
      settings: settingsPage,
    }[page]();
  } catch (e) {
    $('#content').innerHTML =
      `<div class="error">${esc(e.message)}</div><button class="secondary" onclick="render()">Try again</button>`;
  }
}

const THEMES = { light: 'Light', dark: 'Dark', auto: 'Auto', obsidian: 'Obsidian', maison: 'Maison', oud: 'Oud' };

/** Swatches shown in the theme picker: background, surface, accent, text. */
const THEME_SWATCHES = {
  light: ['#f6f5f1', '#ffffff', '#835049', '#24333d', 'Clean and bright'],
  dark: ['#101715', '#18211e', '#5fc28f', '#e4ece8', 'Easy on the eyes at night'],
  auto: ['#f6f5f1', '#101715', '#835049', '#e4ece8', 'Follows your device'],
  obsidian: ['#0d0e10', '#1b1e22', '#cbb48a', '#ece6da', 'Black with champagne gold'],
  maison: ['#f6f3ed', '#fffdf9', '#121212', '#a68a52', 'Ivory couture with a gold thread'],
  oud: ['#0a1411', '#13251f', '#b8935a', '#efe8d8', 'Deep emerald with brushed brass'],
};

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('atelier-theme', theme);
  } catch {}
  showThemeName();
}

/** Kept for older buttons: opens the picker. */
function cycleTheme() {
  themeDialog();
}

function themeDialog() {
  const current = document.documentElement.dataset.theme || 'light';
  modal(
    'Choose a theme',
    `<div class="theme-grid">${Object.entries(THEMES)
      .map(([key, name]) => {
        const [bg, surface, accent, ink, note] = THEME_SWATCHES[key];
        return `<button type="button" class="theme-card${key === current ? ' selected' : ''}" onclick="setTheme('${key}');themeDialog()"><span class="theme-sample" style="background:${bg}"><i style="background:${surface}"></i><i style="background:${accent}"></i><i style="background:${ink}"></i></span><b>${name}</b><small>${note}</small></button>`;
      })
      .join('')}</div><p class="form-hint">Saved on this device. Printed documents always use the light theme.</p>`,
  );
}

function showThemeName() {
  const label = $('#theme-name');
  if (label) label.textContent = THEMES[document.documentElement.dataset.theme] || 'Light';
}

/* Printed documents always use the light theme. */
window.addEventListener('beforeprint', () => {
  document.documentElement.dataset.printTheme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'light';
});
window.addEventListener('afterprint', () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.printTheme || 'light';
});

/** Apply the company's brand colour and logo to the interface. */
function applyBranding() {
  const s = state.boot.settings;
  const root = document.documentElement.style;
  if (/^#[0-9a-f]{6}$/i.test(s.brand_color || '')) {
    root.setProperty('--accent', s.brand_color);
    root.setProperty('--accent-soft', `color-mix(in srgb, ${s.brand_color} 14%, var(--white))`);
  } else {
    root.removeProperty('--accent');
    root.removeProperty('--accent-soft');
  }
  const brand = document.querySelector('.sidebar .brand');
  brand.classList.toggle('has-logo', Boolean(s.logo_path));
  brand.innerHTML = s.logo_path
    ? `<img class="brand-logo-wide" src="${logoUrl()}" alt="${esc(s.company_name)}">`
    : '<span class="brand-mark">A</span><span>atelier<small>PERFUME BUSINESS ERP</small></span>';
}

function logoUrl() {
  return state.boot.settings.logo_path ? '/media/logo?v=' + encodeURIComponent(state.boot.settings.logo_path.slice(-12)) : '';
}

function companyHeader() {
  applyBranding();
  showThemeName();
  $('#company-name').textContent = state.boot.settings.company_name;
  $('#footer-company').textContent = state.boot.settings.company_name;
  $('#user-name').textContent = state.boot.user.name;
  $('#user-role').textContent = state.boot.user.role;
  $('#avatar').textContent = state.boot.user.name[0].toUpperCase();
}

async function start() {
  setupNavigation();
  try {
    state.boot = await api('bootstrap');
    state.location = Number(localStorage.getItem('atelier-location') || state.boot.locations[0]?.id || 1);
    if (!state.boot.locations.some(l => l.id === state.location)) state.location = state.boot.locations[0]?.id;
    companyHeader();
    $('#location-picker').innerHTML = state.boot.locations
      .map(l => `<option value="${l.id}" ${l.id === state.location ? 'selected' : ''}>${esc(l.name)}</option>`)
      .join('');
    $('#location-picker').addEventListener('change', async e => {
      state.location = Number(e.target.value);
      localStorage.setItem('atelier-location', state.location);
      state.cart = [];
      await render();
    });
    window.addEventListener('hashchange', render);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Tab' && $('.modal')) {
        const focus = [
          ...document.querySelectorAll('.modal button,.modal input,.modal select,.modal textarea,.modal a[href]'),
        ].filter(x => !x.disabled && x.offsetParent !== null);
        const first = focus[0],
          last = focus.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    });
    await render();
  } catch (e) {
    $('#content').innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}
