/* Atelier Perfume ERP · Navigation drawer, page routing and start-up. */
'use strict';

const navItems = [
  ['customers', '◎', 'Customer 360', ['manager']],
  ['dashboard', '◫', 'Overview', ['manager', 'accountant', 'warehouse', 'production', 'cashier', 'designer']],
  ['catalogue', '◇', 'Perfume catalogue', ['manager', 'accountant', 'warehouse', 'production', 'cashier', 'designer']],
  ['inventory', '▤', 'Inventory', ['manager', 'warehouse', 'production', 'accountant']],
  ['wholesale', '↗', 'Wholesale & invoices', ['manager', 'accountant', 'warehouse']],
  ['purchasing', '↓', 'Purchasing', ['manager', 'accountant', 'warehouse']],
  ['pos', '▦', 'Point of sale', ['manager', 'cashier']],
  ['production', '⌘', 'Manufacturing', ['manager', 'production', 'warehouse']],
  ['formulas', '⚗', 'Secret formulas', ['manager', 'production']],
  ['projects', '✧', 'Design & packaging', ['manager', 'designer']],
  ['reports', '▥', 'Reports', ['manager', 'accountant']],
  ['settings', '⚙', 'Company & access', ['manager']],
];

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
        `${x[0] === 'reports' ? '<div class="nav-separator"></div>' : ''}<a class="nav-item ${page === x[0] ? 'active' : ''}" href="#${x[0]}"><span class="nav-icon">${x[1]}</span>${x[2]}</a>`,
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
      inventory: inventoryPage,
      wholesale: () => documentsPage(false),
      purchasing: () => documentsPage(true),
      pos: posPage,
      production: productionPage,
      formulas: formulaPage,
      projects: projectsPage,
      reports: reportsPage,
      settings: settingsPage,
    }[page]();
  } catch (e) {
    $('#content').innerHTML =
      `<div class="error">${esc(e.message)}</div><button class="secondary" onclick="render()">Try again</button>`;
  }
}

/** Apply the company's brand colour and logo to the interface. */
function applyBranding() {
  const s = state.boot.settings;
  const root = document.documentElement.style;
  if (/^#[0-9a-f]{6}$/i.test(s.brand_color || '')) {
    root.setProperty('--accent', s.brand_color);
    root.setProperty('--accent-soft', `color-mix(in srgb, ${s.brand_color} 12%, #fff)`);
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
