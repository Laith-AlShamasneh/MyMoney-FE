/**
 * components/notifications.js — MyMoney
 *
 * Notification bell: unread-count badge, dropdown with recent items,
 * mark-as-read, and 30-second background polling.
 *
 * Usage (called by layout.js after initLayout):
 *   import { initNotificationBell } from './notifications.js';
 *   initNotificationBell();
 */

import { t, getLanguage }       from '../core/i18n.js';
import { NotificationService }  from '../services/notification-service.js';
import { showSuccess, showError } from './toast.js';

/* ── Constants ────────────────────────────────────────────────────────────── */
const POLL_INTERVAL_MS  = 30_000;
const DROPDOWN_PAGE_SIZE = 6;

/* ── Category/Type meta ───────────────────────────────────────────────────── */
const CAT_META = {
  1: { icon: 'shield-fill-exclamation', cls: 'cat-security'  },
  2: { icon: 'cash-coin',               cls: 'cat-financial' },
  3: { icon: 'gear-fill',               cls: 'cat-system'    },
  4: { icon: 'file-earmark-bar-graph-fill', cls: 'cat-reports' },
  5: { icon: 'person-fill',             cls: 'cat-profile'   },
};

const TYPE_META = {
  1: { icon: 'info-circle-fill',           cls: 'text-primary' },
  2: { icon: 'check-circle-fill',          cls: 'text-success' },
  3: { icon: 'exclamation-triangle-fill',  cls: 'text-warning' },
  4: { icon: 'x-circle-fill',             cls: 'text-danger'  },
  5: { icon: 'exclamation-circle-fill',    cls: 'text-orange'  },
};

/* ── State ────────────────────────────────────────────────────────────────── */
let _pollTimer   = null;
let _open        = false;
let _unreadCount = 0;

/* ── DOM refs (resolved after layout renders) ─────────────────────────────── */
function _refs() {
  return {
    wrap:          document.getElementById('notificationBellWrap'),
    btn:           document.getElementById('notificationBellBtn'),
    badge:         document.getElementById('notificationBadge'),
    dropdown:      document.getElementById('notificationDropdown'),
    body:          document.getElementById('notifDropdownBody'),
    markAllBtn:    document.getElementById('notifMarkAllBtn'),
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function _esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function _relativeTime(isoStr) {
  if (!isoStr) return '';
  try {
    const diff = Date.now() - new Date(isoStr + 'Z').getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1)  return t('notifications.just_now');
    if (mins < 60) {
      const lang = getLanguage();
      return lang === 'ar'
        ? `منذ ${mins} ${mins === 1 ? 'دقيقة' : 'دقائق'}`
        : `${mins}m ago`;
    }
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) {
      const lang = getLanguage();
      return lang === 'ar'
        ? `منذ ${hrs} ${hrs === 1 ? 'ساعة' : 'ساعات'}`
        : `${hrs}h ago`;
    }
    return new Intl.DateTimeFormat(
      getLanguage() === 'ar' ? 'ar-SA' : 'en-US',
      { month: 'short', day: 'numeric' }
    ).format(new Date(isoStr + 'Z'));
  } catch {
    return '';
  }
}

/* ── Badge ────────────────────────────────────────────────────────────────── */
function _updateBadge(count) {
  _unreadCount = count;
  const { badge, btn } = _refs();
  if (!badge || !btn) return;

  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('d-none');
    btn.setAttribute('aria-label', `${t('notifications.bell_aria')} (${count})`);
  } else {
    badge.classList.add('d-none');
    btn.setAttribute('aria-label', t('notifications.bell_aria'));
  }
}

/* ── Dropdown item builder ────────────────────────────────────────────────── */
function _buildItem(n) {
  const isAr   = getLanguage() === 'ar';
  const title  = _esc(n.title);
  const msg    = _esc(n.message);
  const time   = _relativeTime(n.createdAtUtc);
  const cat    = CAT_META[n.category] ?? CAT_META[3];
  const typ    = TYPE_META[n.type]    ?? TYPE_META[1];
  const unread = n.status === 1;

  return `
    <div class="notif-item${unread ? ' notif-unread' : ''}" data-notif-id="${n.notificationId}">
      <span class="notif-cat-icon ${cat.cls}" aria-hidden="true">
        <i class="bi bi-${cat.icon}"></i>
      </span>
      <div class="notif-content">
        <p class="notif-title">${title}</p>
        <p class="notif-msg">${msg}</p>
        <span class="notif-time">${_esc(time)}</span>
      </div>
      ${unread ? `
      <button class="notif-read-btn" data-mark-read="${n.notificationId}"
              title="${_esc(t('notifications.mark_read'))}"
              aria-label="${_esc(t('notifications.mark_read'))}">
        <i class="bi bi-${typ.icon} ${typ.cls}" aria-hidden="true"></i>
      </button>` : ''}
    </div>`;
}

/* ── Dropdown rendering ───────────────────────────────────────────────────── */
async function _openDropdown() {
  const { dropdown, body, markAllBtn } = _refs();
  if (!dropdown || !body) return;

  dropdown.classList.remove('d-none');
  _open = true;
  body.innerHTML = `<div class="notif-loading"><span class="spinner-border spinner-border-sm"></span></div>`;

  try {
    const data = await NotificationService.getList({ pageSize: DROPDOWN_PAGE_SIZE });
    const items = data?.items ?? [];

    if (!items.length) {
      body.innerHTML = `<div class="notif-empty"><i class="bi bi-bell-slash" aria-hidden="true"></i><span>${_esc(t('notifications.empty'))}</span></div>`;
    } else {
      body.innerHTML = items.map(_buildItem).join('');
      body.querySelectorAll('[data-mark-read]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          _markRead(Number(btn.dataset.markRead));
        });
      });
    }

    if (markAllBtn) {
      markAllBtn.classList.toggle('d-none', _unreadCount === 0);
    }
  } catch {
    body.innerHTML = `<div class="notif-empty"><span>${_esc(t('errors.unknown'))}</span></div>`;
  }
}

function _closeDropdown() {
  const { dropdown } = _refs();
  dropdown?.classList.add('d-none');
  _open = false;
}

/* ── Actions ──────────────────────────────────────────────────────────────── */
async function _markRead(id) {
  try {
    await NotificationService.markRead(id);
    const item = document.querySelector(`[data-notif-id="${id}"]`);
    if (item) {
      item.classList.remove('notif-unread');
      item.querySelector('[data-mark-read]')?.remove();
    }
    if (_unreadCount > 0) _updateBadge(_unreadCount - 1);
  } catch { /* silent */ }
}

async function _markAllRead() {
  const { markAllBtn } = _refs();
  if (markAllBtn) markAllBtn.disabled = true;
  try {
    await NotificationService.markAllRead();
    _updateBadge(0);
    document.querySelectorAll('.notif-item.notif-unread').forEach(el => {
      el.classList.remove('notif-unread');
      el.querySelector('[data-mark-read]')?.remove();
    });
    markAllBtn?.classList.add('d-none');
    showSuccess(t('notifications.mark_all_read_success'));
  } catch {
    showError(t('errors.unknown'));
  } finally {
    if (markAllBtn) markAllBtn.disabled = false;
  }
}

/* ── Polling ──────────────────────────────────────────────────────────────── */
async function _fetchUnreadCount() {
  try {
    const data = await NotificationService.getUnreadCount();
    _updateBadge(data?.count ?? 0);
  } catch { /* silent — don't surface polling errors */ }
}

function _startPolling() {
  _fetchUnreadCount();
  _pollTimer = setInterval(_fetchUnreadCount, POLL_INTERVAL_MS);
}

function _stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

/* ── Event wiring ─────────────────────────────────────────────────────────── */
function _wireEvents() {
  const { btn, dropdown, markAllBtn } = _refs();

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_open) _closeDropdown();
    else _openDropdown();
  });

  markAllBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    _markAllRead();
  });

  document.addEventListener('click', (e) => {
    if (_open && !document.getElementById('notificationBellWrap')?.contains(e.target)) {
      _closeDropdown();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _open) _closeDropdown();
  });

  window.addEventListener('beforeunload', _stopPolling);
}

/* ── Public ───────────────────────────────────────────────────────────────── */

/**
 * Initialise the notification bell.
 * Must be called after initLayout() has injected the navbar HTML.
 */
export function initNotificationBell() {
  _wireEvents();
  _startPolling();
}
