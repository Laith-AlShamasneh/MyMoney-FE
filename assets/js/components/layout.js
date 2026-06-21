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
  { key: 'financial_intelligence',path: Config.ROUTES.FINANCIAL_INTELLIGENCE,icon: 'lightbulb',            i18nKey: 'nav.financial_intelligence' },
  { key: 'reports',               path: Config.ROUTES.REPORTS,               icon: 'file-earmark-bar-graph', i18nKey: 'nav.reports' },
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
  return NAV_ITEMS.map(({ path, icon, i18nKey }) => {
    const isActive = _isActivePath(path);
    return `
      <a class="nav-link${isActive ? ' active' : ''}" href="${path}"${isActive ? ' aria-current="page"' : ''}>
        <span class="nav-icon"><i class="bi bi-${icon}" aria-hidden="true"></i></span>
        <span class="nav-text" data-i18n="${i18nKey}">${t(i18nKey)}</span>
      </a>`;
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

function _buildNavbar(user) {
  const userName = user?.displayName || t('layout.user_placeholder');
  const avatarSrc = user?.profileImageUrl || '/assets/images/avatar/avatar.jpg';
  const themeLabel = t('layout.switch_to_dark');

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
          <button class="icon-button lang-switch-btn" type="button"
                  data-lang-switch
                  data-i18n="layout.lang_switch_label"
                  data-i18n-aria-label="layout.lang_switch_aria"
                  aria-label="${t('layout.lang_switch_aria')}"
                  title="${t('layout.lang_switch_aria')}">
            ${t('layout.lang_switch_label')}
          </button>

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
