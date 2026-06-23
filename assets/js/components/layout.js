/**
 * components/layout.js — MyMoney
 *
 * Renders the shared sidebar, top navbar, and footer into their placeholder
 * elements on every dashboard page. This is the single source of truth for
 * the admin shell HTML — no sidebar or navbar markup is duplicated across pages.
 *
 * Usage (in any dashboard page script):
 *   import { initLayout } from '../components/layout.js';
 *   await initLayout();
 */

import { Config } from '../core/config.js';
import { t, getLanguage, setLanguage } from '../core/i18n.js';
import { getCurrentUser, logout } from '../core/auth.js';
import { initNotificationBell } from './notifications.js';
import {
  getDisplayCurrency, setDisplayCurrency,
  getCurrencyList, initCurrency, currencyFlag,
} from '../core/currency.js';
import { WorkspaceService } from '../services/workspace-service.js';

/* --------------------------------------------------------------------------
   Navigation item definitions
   Add / remove items here — they auto-reflect on every dashboard page.
   -------------------------------------------------------------------------- */
const NAV_ITEMS = [
  { key: 'dashboard',             path: Config.ROUTES.DASHBOARD,             icon: 'speedometer2',         i18nKey: 'nav.dashboard' },
  { key: 'transactions',          path: Config.ROUTES.TRANSACTIONS,          icon: 'receipt',              i18nKey: 'nav.transactions' },
  { key: 'recurring',             path: Config.ROUTES.RECURRING,             icon: 'arrow-repeat',         i18nKey: 'nav.recurring' },
  { key: 'goals',                 path: Config.ROUTES.GOALS,                 icon: 'piggy-bank',            i18nKey: 'nav.goals' },
  { key: 'budgets',               path: Config.ROUTES.BUDGETS,               icon: 'wallet2',               i18nKey: 'nav.budgets' },
  { key: 'cash_flow',              path: Config.ROUTES.CASH_FLOW,              icon: 'graph-up-arrow',       i18nKey: 'nav.cash_flow' },
  { key: 'calendar',               path: Config.ROUTES.CALENDAR,               icon: 'calendar3',             i18nKey: 'nav.calendar' },
  { key: 'receipts',               path: Config.ROUTES.RECEIPTS,               icon: 'file-earmark-image',   i18nKey: 'nav.receipts' },
  { key: 'financial_intelligence',path: Config.ROUTES.FINANCIAL_INTELLIGENCE,icon: 'lightbulb',            i18nKey: 'nav.financial_intelligence' },
  { key: 'reports',               path: Config.ROUTES.REPORTS,               icon: 'file-earmark-bar-graph', i18nKey: 'nav.reports' },
  { key: 'workspace',             path: Config.ROUTES.WORKSPACE_DASHBOARD,   icon: 'grid-1x2',             i18nKey: 'nav.workspace', dividerBefore: true },
  { key: 'profile',               path: Config.ROUTES.PROFILE,               icon: 'person-badge',         i18nKey: 'nav.profile' },
  { key: 'settings',              path: Config.ROUTES.SETTINGS,              icon: 'gear',                 i18nKey: 'nav.settings' },
];

/* --------------------------------------------------------------------------
   Theme management
   -------------------------------------------------------------------------- */
function _getStoredTheme() {
  try { return localStorage.getItem(Config.STORAGE_KEYS.THEME); } catch { return null; }
}
function _saveTheme(theme) {
  try { localStorage.setItem(Config.STORAGE_KEYS.THEME, theme); } catch { /* ignore */ }
}
function _getPreferredTheme() {
  const saved = _getStoredTheme();
  if (saved === 'dark' || saved === 'light') return saved;
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}
function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-bs-theme', theme);
  _saveTheme(theme);
  _updateThemeIcons(theme);
  // Notify pages (e.g. chart modules) so they can rebuild with correct colours.
  document.dispatchEvent(new CustomEvent('mm-theme-change', { detail: { theme } }));
}
function _updateThemeIcons(theme) {
  const nextLabel = t(theme === 'dark' ? 'layout.switch_to_light' : 'layout.switch_to_dark');
  const iconClass = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-label', nextLabel);
    btn.title = nextLabel;
  });
  document.querySelectorAll('[data-theme-icon]').forEach((icon) => {
    icon.className = iconClass;
  });
}

/* --------------------------------------------------------------------------
   Sidebar mini mode
   -------------------------------------------------------------------------- */
function _getSavedMiniState() {
  try { return localStorage.getItem(Config.STORAGE_KEYS.SIDEBAR_MINI) === 'true'; } catch { return false; }
}
function _saveMiniState(isMini) {
  try { localStorage.setItem(Config.STORAGE_KEYS.SIDEBAR_MINI, String(isMini)); } catch { /* ignore */ }
}

/* --------------------------------------------------------------------------
   Active nav detection
   -------------------------------------------------------------------------- */
function _isActivePath(itemPath) {
  return window.location.pathname === itemPath ||
         window.location.pathname.endsWith(itemPath.replace(/^\//, ''));
}

/* --------------------------------------------------------------------------
   HTML builders
   -------------------------------------------------------------------------- */
function _buildNavItems() {
  const wsCtx     = _loadWorkspaceContext();
  const inWs      = !!(wsCtx?.currentWorkspaceId);

  return NAV_ITEMS.map(({ key, path, icon, i18nKey, dividerBefore }) => {
    const isActive = _isActivePath(path);
    const divider  = dividerBefore ? '<hr class="sidebar-divider" aria-hidden="true">' : '';

    let subNav = '';
    if (key === 'workspace' && inWs) {
      const wsPages = [
        { path: Config.ROUTES.WORKSPACE_MEMBERS,     icon: 'people',        i18nKey: 'nav.ws_members' },
        { path: Config.ROUTES.WORKSPACE_INVITATIONS, icon: 'envelope-paper',i18nKey: 'nav.ws_invitations' },
        { path: Config.ROUTES.WORKSPACE_ROLES,       icon: 'shield-lock',   i18nKey: 'nav.ws_roles' },
        { path: Config.ROUTES.WORKSPACE_SETTINGS,    icon: 'gear',          i18nKey: 'nav.ws_settings' },
      ];
      subNav = `<div class="sidebar-subnav" role="list">` +
        wsPages.map(p => {
          const active = _isActivePath(p.path);
          return `
          <a class="subnav-link${active ? ' active' : ''}" href="${p.path}" role="listitem"${active ? ' aria-current="page"' : ''}>
            <span class="subnav-icon"><i class="bi bi-${p.icon}" aria-hidden="true"></i></span>
            <span class="nav-text" data-i18n="${p.i18nKey}">${t(p.i18nKey)}</span>
          </a>`;
        }).join('') + `</div>`;
    }

    return `${divider}
      <a class="nav-link${isActive ? ' active' : ''}" href="${path}"${isActive ? ' aria-current="page"' : ''}>
        <span class="nav-icon"><i class="bi bi-${icon}" aria-hidden="true"></i></span>
        <span class="nav-text" data-i18n="${i18nKey}">${t(i18nKey)}</span>
      </a>${subNav}`;
  }).join('');
}

function _buildSidebar() {
  const appName = Config.APP_NAME;

  return `
    <aside class="admin-sidebar" id="adminSidebar" aria-label="${t('layout.sidebar_aria_label')}">
      <div class="sidebar-header">
        <a class="brand-mark" href="${Config.ROUTES.DASHBOARD}" aria-label="${appName}">
          <span class="brand-icon"><i class="bi bi-wallet2" aria-hidden="true"></i></span>
          <span class="brand-copy">
            <span class="brand-title">${appName}</span>
            <span class="brand-subtitle" data-i18n="layout.brand_subtitle">${t('layout.brand_subtitle')}</span>
          </span>
        </a>
      </div>

      <nav class="sidebar-nav">${_buildNavItems()}</nav>

      <div class="sidebar-footer">
        <span class="status-dot"></span>
        <span class="sidebar-footer-text" data-i18n="layout.system_status">${t('layout.system_status')}</span>
      </div>
    </aside>`;
}

function _buildWorkspaceSwitcher() {
  const ctx = _loadWorkspaceContext();
  const name  = ctx?.workspaceName || t('workspace.personal_mode');
  const color = ctx?.color || '#2563eb';
  const initial = name.trim().charAt(0).toUpperCase();

  return `
    <div class="ws-switcher-wrap" id="wsSwitcherWrap">
      <button class="ws-switcher-btn" type="button"
              id="wsSwitcherBtn"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-label="${t('workspace.switcher_aria')}">
        <span class="ws-dot" id="wsDot" style="background:${color}"></span>
        <span class="ws-switcher-name" id="wsName">${name}</span>
        <i class="bi bi-chevron-down ws-switcher-caret" aria-hidden="true"></i>
      </button>
      <div class="ws-dropdown d-none" id="wsDropdown" role="listbox"
           aria-label="${t('workspace.switcher_aria')}">
        <div class="ws-dropdown-header" data-i18n="workspace.switcher_header">${t('workspace.switcher_header')}</div>
        <div class="ws-dropdown-list" id="wsDropdownList"></div>
        <div class="ws-dropdown-actions">
          <a class="ws-dropdown-action" href="${Config.ROUTES.WORKSPACE_DASHBOARD}">
            <i class="bi bi-grid-1x2" aria-hidden="true"></i>
            <span data-i18n="workspace.manage">${t('workspace.manage')}</span>
          </a>
          <button class="ws-dropdown-action" type="button" id="wsCreateBtn">
            <i class="bi bi-plus-circle" aria-hidden="true"></i>
            <span data-i18n="workspace.create_new">${t('workspace.create_new')}</span>
          </button>
        </div>
      </div>
    </div>`;
}

function _loadWorkspaceContext() {
  try {
    const raw = localStorage.getItem(Config.STORAGE_KEYS.WORKSPACE_CONTEXT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function _buildNavbar(user) {
  const userName   = user?.displayName || t('layout.user_placeholder');
  const avatarSrc  = user?.profileImageUrl || '/assets/images/avatar/avatar.jpg';
  const themeLabel = t('layout.switch_to_dark');
  const currCode   = getDisplayCurrency();
  const currFlag   = currencyFlag(currCode);

  return `
    <nav class="navbar admin-navbar navbar-expand bg-white" id="adminNavbar">
      <div class="container-fluid px-3 px-lg-4">
        <button class="sidebar-toggle" type="button"
                data-sidebar-toggle
                aria-controls="adminSidebar"
                aria-expanded="true"
                aria-label="${t('layout.sidebar_toggle_label')}">
          <span></span><span></span><span></span>
        </button>

        <div class="navbar-actions ms-auto">
          ${_buildWorkspaceSwitcher()}

          <button class="icon-button lang-switch-btn" type="button"
                  data-lang-switch
                  data-i18n="layout.lang_switch_label"
                  data-i18n-aria-label="layout.lang_switch_aria"
                  aria-label="${t('layout.lang_switch_aria')}"
                  title="${t('layout.lang_switch_aria')}">
            ${t('layout.lang_switch_label')}
          </button>

          <div class="currency-switcher-wrap" id="currencySwitcherWrap">
            <button class="currency-switcher-btn" type="button"
                    id="currencySwitcherBtn"
                    aria-haspopup="listbox"
                    aria-expanded="false"
                    aria-label="${t('currency.switcher_aria')}">
              <span class="cs-flag" id="csBtnFlag" aria-hidden="true">${currFlag}</span>
              <span class="cs-code" id="csBtnCode">${currCode}</span>
              <i class="bi bi-chevron-down cs-caret" aria-hidden="true"></i>
            </button>
            <div class="currency-dropdown d-none" id="currencyDropdown" role="listbox"
                 aria-label="${t('currency.switcher_aria')}">
              <div class="cs-search-wrap position-relative">
                <i class="bi bi-search cs-search-icon" aria-hidden="true"></i>
                <input type="search" class="cs-search-input" id="csSearchInput"
                       placeholder="${t('currency.switcher_search_placeholder')}"
                       autocomplete="off" spellcheck="false">
              </div>
              <div class="cs-list" id="csListWrap" role="presentation"></div>
              <div class="cs-footer">
                <a class="cs-footer-link" href="${Config.ROUTES.CURRENCY}">
                  <i class="bi bi-graph-up" aria-hidden="true"></i>
                  ${t('currency.manage_rates')}
                </a>
              </div>
            </div>
          </div>

          <button class="icon-button theme-toggle" type="button"
                  data-theme-toggle
                  aria-label="${themeLabel}"
                  title="${themeLabel}">
            <i class="bi bi-moon-stars" data-theme-icon aria-hidden="true"></i>
          </button>

          <div class="notification-bell-wrap" id="notificationBellWrap">
            <button class="icon-button notification-bell-btn" type="button"
                    id="notificationBellBtn"
                    aria-label="${t('notifications.bell_aria')}"
                    title="${t('notifications.bell_aria')}">
              <i class="bi bi-bell" aria-hidden="true"></i>
              <span class="notification-badge d-none" id="notificationBadge" aria-live="polite" aria-atomic="true"></span>
            </button>
            <div class="notification-dropdown d-none" id="notificationDropdown"
                 role="dialog"
                 aria-label="${t('notifications.dropdown_title')}">
              <div class="notif-dropdown-header">
                <span data-i18n="notifications.dropdown_title">${t('notifications.dropdown_title')}</span>
                <button class="notif-mark-all-btn d-none" type="button" id="notifMarkAllBtn"
                        data-i18n="notifications.mark_all_read">${t('notifications.mark_all_read')}</button>
              </div>
              <div class="notif-dropdown-body" id="notifDropdownBody"></div>
              <div class="notif-dropdown-footer">
                <a href="${Config.ROUTES.NOTIFICATIONS}" data-i18n="notifications.view_all">${t('notifications.view_all')}</a>
              </div>
            </div>
          </div>

          <div class="dropdown">
            <button class="profile-button dropdown-toggle" type="button"
                    data-bs-toggle="dropdown" aria-expanded="false">
              <img class="avatar-img avatar-sm" src="${avatarSrc}" alt="${userName}" id="navbarUserAvatar">
              <span class="profile-name d-none d-sm-inline" id="navbarUserName">${userName}</span>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item" href="${Config.ROUTES.PROFILE}" data-i18n="nav.profile">${t('nav.profile')}</a></li>
              <li><a class="dropdown-item" href="${Config.ROUTES.SETTINGS}" data-i18n="nav.settings">${t('nav.settings')}</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item" type="button" id="logoutBtn" data-i18n="nav.logout">${t('nav.logout')}</button></li>
            </ul>
          </div>
        </div>
      </div>
    </nav>`;
}

function _buildFooter() {
  return `
    <footer class="admin-footer">
      <div class="container-fluid px-3 px-lg-4">
        <span data-i18n="layout.footer_copyright">${t('layout.footer_copyright')}</span>
        <span data-i18n="layout.footer_tagline">${t('layout.footer_tagline')}</span>
      </div>
    </footer>`;
}

/* --------------------------------------------------------------------------
   Event wiring
   -------------------------------------------------------------------------- */
function _wireEvents() {
  const body           = document.body;
  const sidebarToggle  = document.querySelector('[data-sidebar-toggle]');
  const backdrop       = document.querySelector('.sidebar-backdrop');
  const sidebarLinks   = document.querySelectorAll('.sidebar-nav .nav-link');
  const desktopMedia   = window.matchMedia('(min-width: 992px)');
  const logoutBtn      = document.getElementById('logoutBtn');

  function isDesktop() { return desktopMedia.matches; }

  function closeMobileSidebar() {
    body.classList.remove('sidebar-open');
    sidebarToggle?.setAttribute('aria-expanded', 'false');
  }

  function toggleSidebar() {
    if (isDesktop()) {
      body.classList.toggle('sidebar-mini');
      _saveMiniState(body.classList.contains('sidebar-mini'));
      sidebarToggle?.setAttribute('aria-expanded', String(!body.classList.contains('sidebar-mini')));
    } else {
      body.classList.toggle('sidebar-open');
      sidebarToggle?.setAttribute('aria-expanded', String(body.classList.contains('sidebar-open')));
    }
  }

  /* Apply saved mini state on desktop */
  if (isDesktop() && _getSavedMiniState()) {
    body.classList.add('sidebar-mini');
    sidebarToggle?.setAttribute('aria-expanded', 'false');
  }

  sidebarToggle?.addEventListener('click', toggleSidebar);
  backdrop?.addEventListener('click', closeMobileSidebar);
  sidebarLinks.forEach((link) => link.addEventListener('click', () => { if (!isDesktop()) closeMobileSidebar(); }));

  /* Adapt on breakpoint change */
  const handleBreakpoint = () => {
    if (isDesktop()) {
      body.classList.remove('sidebar-open');
      if (_getSavedMiniState()) body.classList.add('sidebar-mini');
      else body.classList.remove('sidebar-mini');
    } else {
      body.classList.remove('sidebar-mini');
    }
  };

  if (desktopMedia.addEventListener) {
    desktopMedia.addEventListener('change', handleBreakpoint);
  } else {
    desktopMedia.addListener(handleBreakpoint);
  }

  /* Theme toggles */
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      _applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  });

  /* Language switcher */
  document.querySelectorAll('[data-lang-switch]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = getLanguage() === 'ar' ? 'en' : 'ar';
      await setLanguage(next);
    });
  });

  /* Logout */
  logoutBtn?.addEventListener('click', async () => {
    if (logoutBtn.disabled) return;
    logoutBtn.disabled = true;
    await logout();
  });

  /* Currency switcher */
  _wireCurrencySwitcher();

  /* Workspace switcher */
  _wireWorkspaceSwitcher();
}

/* --------------------------------------------------------------------------
   Currency switcher logic
   -------------------------------------------------------------------------- */
function _buildCurrencyList(filter = '') {
  const list      = getCurrencyList();
  const current   = getDisplayCurrency();
  const lang      = getLanguage();
  const query     = filter.trim().toLowerCase();
  const isAr      = lang === 'ar';

  const items = query
    ? list.filter(c =>
        c.code.toLowerCase().includes(query) ||
        c.nameEn.toLowerCase().includes(query) ||
        (c.nameAr && c.nameAr.includes(query))
      )
    : list;

  if (!items.length) {
    return `<div class="cs-no-results">${t('currency.switcher_no_results')}</div>`;
  }

  let html = '';

  // Show active currency first when not searching
  if (!query) {
    const active = items.find(c => c.code === current);
    if (active) {
      html += `<div class="cs-section-label">${t('currency.switcher_current')}</div>`;
      html += _buildCsItem(active, current, isAr);
      html += `<div class="cs-section-label">${t('currency.switcher_all')}</div>`;
    } else {
      html += `<div class="cs-section-label">${t('currency.switcher_all')}</div>`;
    }
  }

  items.forEach(c => {
    if (!query && c.code === current) return; // already shown above
    html += _buildCsItem(c, current, isAr);
  });

  return html;
}

function _buildCsItem(c, current, isAr) {
  const flag    = currencyFlag(c.code);
  const name    = isAr && c.nameAr ? c.nameAr : c.nameEn;
  const isActive = c.code === current;
  const check   = isActive ? '<i class="bi bi-check2 cs-item-check" aria-hidden="true"></i>' : '';

  return `<button class="cs-item${isActive ? ' active' : ''}"
                   type="button"
                   role="option"
                   aria-selected="${isActive}"
                   data-cs-code="${c.code}">
    <span class="cs-item-flag" aria-hidden="true">${flag}</span>
    <span class="cs-item-body">
      <span class="cs-item-code">${c.code}</span>
      <span class="cs-item-name">${name}</span>
    </span>
    ${check}
  </button>`;
}

function _renderCurrencyDropdown(filter = '') {
  const wrap = document.getElementById('csListWrap');
  if (wrap) wrap.innerHTML = _buildCurrencyList(filter);
}

function _updateSwitcherButton(code) {
  const btnCode = document.getElementById('csBtnCode');
  const btnFlag = document.getElementById('csBtnFlag');
  if (btnCode) btnCode.textContent = code;
  if (btnFlag) btnFlag.textContent = currencyFlag(code);
}

function _wireCurrencySwitcher() {
  const btn      = document.getElementById('currencySwitcherBtn');
  const dropdown = document.getElementById('currencyDropdown');
  const search   = document.getElementById('csSearchInput');
  const wrap     = document.getElementById('currencySwitcherWrap');
  if (!btn || !dropdown) return;

  let _open = false;

  function openDropdown() {
    if (_open) return;
    _open = true;
    _renderCurrencyDropdown('');
    dropdown.classList.remove('d-none');
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => search?.focus(), 60);
  }

  function closeDropdown() {
    if (!_open) return;
    _open = false;
    dropdown.classList.add('d-none');
    btn.setAttribute('aria-expanded', 'false');
    if (search) search.value = '';
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    _open ? closeDropdown() : openDropdown();
  });

  // Search filter
  search?.addEventListener('input', () => {
    _renderCurrencyDropdown(search.value);
  });

  // Item selection (event delegation)
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('[data-cs-code]');
    if (!item) return;
    const code = item.dataset.csCode;
    if (!code) return;

    // Animate selection
    item.style.transition = 'background 0.1s ease';
    item.style.background = 'var(--mm-primary-light)';
    setTimeout(() => {
      setDisplayCurrency(code);
      _updateSwitcherButton(code);
      closeDropdown();

      // Persist to backend (non-blocking)
      import('../services/currency-service.js').then(({ CurrencyService }) => {
        CurrencyService.updateUserPreferences({
          baseCurrencyCode:    code,
          displayCurrencyCode: code,
          numberFormatId:      1,
          symbolStyleId:       1,
          negativeFormatId:    1,
          currencyPositionId:  1,
        }).catch(() => { /* non-fatal */ });
      });
    }, 80);
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (_open && !wrap?.contains(e.target)) closeDropdown();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _open) { closeDropdown(); btn.focus(); }
  });

  // When currency-change event fires (from other sources), sync the button
  document.addEventListener('mm-currency-change', (e) => {
    _updateSwitcherButton(e.detail.code);
    if (_open) _renderCurrencyDropdown(search?.value || '');
  });

  // Populate list once currencies are loaded
  document.addEventListener('mm-currencies-loaded', () => {
    if (_open) _renderCurrencyDropdown(search?.value || '');
  });
}

/* --------------------------------------------------------------------------
   Workspace switcher logic
   -------------------------------------------------------------------------- */
const WS_COLORS = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#6366f1','#db2777'];

function _wsInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.trim().charAt(0).toUpperCase();
}

function _buildWsItems(workspaces) {
  if (!workspaces?.length) {
    return `<div style="padding:0.75rem 1rem;font-size:0.8125rem;color:var(--mm-muted)" data-i18n="workspace.no_workspaces">${t('workspace.no_workspaces')}</div>`;
  }
  return workspaces.map(ws => {
    const color    = ws.color || WS_COLORS[ws.workspaceId % WS_COLORS.length];
    const init     = _wsInitials(ws.name);
    const isActive = !!(ws.isCurrent);
    return `
      <button class="ws-item${isActive ? ' active' : ''}" type="button"
              role="option" aria-selected="${isActive}"
              data-ws-id="${ws.workspaceId}" data-ws-color="${color}"
              data-ws-name="${ws.name}">
        <span class="ws-item-dot" style="background:${color}">${init}</span>
        <span class="ws-item-body">
          <span class="ws-item-name">${ws.name}</span>
          <span class="ws-item-meta">${ws.activeMemberCount != null ? t('workspace.members_count', { n: ws.activeMemberCount }) : ''}</span>
        </span>
        ${isActive ? '<i class="bi bi-check2 ws-item-check" aria-hidden="true"></i>' : ''}
      </button>`;
  }).join('');
}

function _wireWorkspaceSwitcher() {
  const btn      = document.getElementById('wsSwitcherBtn');
  const dropdown = document.getElementById('wsDropdown');
  const listWrap = document.getElementById('wsDropdownList');
  const wrap     = document.getElementById('wsSwitcherWrap');
  const createBtn = document.getElementById('wsCreateBtn');
  if (!btn || !dropdown) return;

  let _open = false;
  let _wsLoaded = false;

  function openDropdown() {
    if (_open) return;
    _open = true;
    dropdown.classList.remove('d-none');
    btn.setAttribute('aria-expanded', 'true');
    if (!_wsLoaded) {
      _wsLoaded = true;
      _loadWsList();
    }
  }

  function closeDropdown() {
    if (!_open) return;
    _open = false;
    dropdown.classList.add('d-none');
    btn.setAttribute('aria-expanded', 'false');
  }

  async function _loadWsList() {
    if (listWrap) listWrap.innerHTML = `<div style="padding:0.75rem 1rem;font-size:0.8125rem;color:var(--mm-muted)">${t('common.loading')}</div>`;
    try {
      const list = await WorkspaceService.getList();
      if (listWrap) listWrap.innerHTML = _buildWsItems(list);
    } catch {
      if (listWrap) listWrap.innerHTML = `<div style="padding:0.75rem 1rem;font-size:0.8125rem;color:var(--mm-danger)">${t('errors.server')}</div>`;
    }
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    _open ? closeDropdown() : openDropdown();
  });

  dropdown.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-ws-id]');
    if (!item) return;
    const wsId  = Number(item.dataset.wsId) || null;
    const color = item.dataset.wsColor || '#2563eb';
    const name  = item.dataset.wsName  || '';
    closeDropdown();
    try {
      await WorkspaceService.switchWorkspace(wsId);
      // Update navbar display
      const dot  = document.getElementById('wsDot');
      const nm   = document.getElementById('wsName');
      if (dot) dot.style.background = color;
      if (nm)  nm.textContent = name;
      // Notify page
      window.dispatchEvent(new CustomEvent('mm-workspace-change', {
        detail: { workspaceId: wsId, name, color },
      }));
    } catch { /* silently ignore — non-fatal */ }
  });

  createBtn?.addEventListener('click', () => {
    closeDropdown();
    window.location.href = Config.ROUTES.WORKSPACE_DASHBOARD + '?action=create';
  });

  document.addEventListener('click', (e) => {
    if (_open && !wrap?.contains(e.target)) closeDropdown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _open) { closeDropdown(); btn.focus(); }
  });

  // When workspace context changes from another source, sync the button
  window.addEventListener('mm-workspace-change', (e) => {
    const dot = document.getElementById('wsDot');
    const nm  = document.getElementById('wsName');
    if (dot && e.detail?.color) dot.style.background = e.detail.color;
    if (nm  && e.detail?.name)  nm.textContent = e.detail.name;
  });

  // Load context to display current workspace on first render
  WorkspaceService.getContext().then(ctx => {
    if (!ctx) return;
    const dot = document.getElementById('wsDot');
    const nm  = document.getElementById('wsName');
    if (dot && ctx.color) dot.style.background = ctx.color;
    if (nm)  nm.textContent = ctx.workspaceName || t('workspace.personal_mode');
  }).catch(() => { /* non-fatal */ });
}

/* --------------------------------------------------------------------------
   Public entry point
   -------------------------------------------------------------------------- */

/**
 * Initialises the theme toggle only — no layout injection.
 * Use on auth pages and error pages that don't have a sidebar/navbar.
 * Must be called after initI18n() has resolved.
 */
export function initTheme() {
  _applyTheme(_getPreferredTheme());

  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      _applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  });
}

/**
 * Renders the sidebar, navbar, and footer into their placeholder elements,
 * then wires up all interactive behaviour.
 *
 * Must be called after initI18n() has resolved.
 */
export function initLayout() {
  const user = getCurrentUser();

  /* Inject shared HTML */
  const sidebarRoot = document.getElementById('sidebar-root');
  const navbarRoot  = document.getElementById('navbar-root');
  const footerRoot  = document.getElementById('footer-root');

  if (sidebarRoot) sidebarRoot.outerHTML = _buildSidebar();
  if (navbarRoot)  navbarRoot.outerHTML  = _buildNavbar(user);
  if (footerRoot)  footerRoot.outerHTML  = _buildFooter();

  /* Apply theme */
  _applyTheme(_getPreferredTheme());

  /* Wire interactive behaviour */
  _wireEvents();

  /* Notification bell */
  initNotificationBell();

  /* Currency — load prefs + list asynchronously; fires mm-currency-change if needed */
  initCurrency().then(() => {
    document.dispatchEvent(new CustomEvent('mm-currencies-loaded'));
    _updateSwitcherButton(getDisplayCurrency());
  }).catch(() => { /* non-fatal */ });
}

/**
 * Wires the language-switch button(s) on auth / standalone pages.
 * Must be called after initI18n() has resolved.
 * The button text and aria-label are kept in sync automatically via
 * data-i18n / data-i18n-aria-label; this function only wires the click.
 */
export function initLangSwitcher() {
  document.querySelectorAll('[data-lang-switch]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = getLanguage() === 'ar' ? 'en' : 'ar';
      await setLanguage(next);
    });
  });
}

/**
 * Updates the user avatar and name in the layout after profile changes.
 * @param {{ displayName?: string, profileImageUrl?: string }} updates
 */
export function updateLayoutUser(updates) {
  if (updates.displayName) {
    const el = document.getElementById('navbarUserName');
    if (el) el.textContent = updates.displayName;
  }
  if (updates.profileImageUrl) {
    const img = document.getElementById('navbarUserAvatar');
    if (img) img.src = updates.profileImageUrl;
  }
}
