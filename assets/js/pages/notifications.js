/**
 * pages/notifications.js — MyMoney
 * Full notifications page: filter tabs, paginated list, per-item actions.
 */

import { initI18n, t, getLanguage }   from '../core/i18n.js';
import { initLayout }                 from '../components/layout.js';
import { guardPage }                  from '../core/auth.js';
import { initOnboarding }             from '../components/onboarding.js';
import { NotificationService }        from '../services/notification-service.js';
import { showSuccess, showError }     from '../components/toast.js';
import { Loader }                     from '../components/loading.js';
import { initWorkspaceContext }       from '../services/workspace-context.js';

/* ── Constants ────────────────────────────────────────────────────────────── */
const PAGE_SIZE = 15;

/* Status constants (mirror backend NotificationStatus enum) */
const STATUS = { ALL: null, UNREAD: 1, READ: 2, ARCHIVED: 3 };

const FILTER_STATUS_MAP = {
  all:      STATUS.ALL,
  unread:   STATUS.UNREAD,
  read:     STATUS.READ,
  archived: STATUS.ARCHIVED,
};

const CAT_META = {
  1: { icon: 'shield-fill-exclamation', cls: 'cat-security'  },
  2: { icon: 'cash-coin',               cls: 'cat-financial' },
  3: { icon: 'gear-fill',               cls: 'cat-system'    },
  4: { icon: 'file-earmark-bar-graph-fill', cls: 'cat-reports' },
  5: { icon: 'person-fill',             cls: 'cat-profile'   },
};

const PRIORITY_META = {
  1: { cls: 'notif-priority-1', key: 'notifications.priority_low'      },
  2: { cls: 'notif-priority-2', key: 'notifications.priority_normal'   },
  3: { cls: 'notif-priority-3', key: 'notifications.priority_high'     },
  4: { cls: 'notif-priority-4', key: 'notifications.priority_critical' },
};

/* ── State ────────────────────────────────────────────────────────────────── */
let _currentFilter  = 'all';
let _currentPage    = 1;
let _totalPages     = 1;
let _totalCount     = 0;
let _unreadCount    = 0;
let _loading        = false;

/* ── DOM refs ─────────────────────────────────────────────────────────────── */
const elLoading       = document.getElementById('notifLoading');
const elError         = document.getElementById('notifError');
const elErrorMsg      = document.getElementById('notifErrorMsg');
const elList          = document.getElementById('notifList');
const elEmpty         = document.getElementById('notifEmpty');
const elEmptyMsg      = document.getElementById('notifEmptyMsg');
const elPagination    = document.getElementById('notifPagination');
const elFilters       = document.getElementById('notifFilters');
const elMarkAllBtn    = document.getElementById('pageMarkAllReadBtn');

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
    if (mins < 1) return t('notifications.just_now');
    if (mins < 60) {
      return getLanguage() === 'ar'
        ? `منذ ${mins} ${mins === 1 ? 'دقيقة' : 'دقائق'}`
        : `${mins}m ago`;
    }
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) {
      return getLanguage() === 'ar'
        ? `منذ ${hrs} ${hrs === 1 ? 'ساعة' : 'ساعات'}`
        : `${hrs}h ago`;
    }
    return new Intl.DateTimeFormat(
      getLanguage() === 'ar' ? 'ar-SA' : 'en-US',
      { year: 'numeric', month: 'short', day: 'numeric' }
    ).format(new Date(isoStr + 'Z'));
  } catch {
    return '';
  }
}

/* ── Item builder ─────────────────────────────────────────────────────────── */
function _buildPageItem(n) {
  const cat    = CAT_META[n.category]  ?? CAT_META[3];
  const prio   = PRIORITY_META[n.priority] ?? PRIORITY_META[1];
  const unread = n.status === 1;
  const archived = n.status === 3;
  const time   = _relativeTime(n.createdAtUtc);

  const actionsBefore = !archived ? `
    ${unread ? `
    <button class="notif-action-btn" data-action="mark-read" data-id="${n.notificationId}"
            title="${_esc(t('notifications.mark_read'))}" aria-label="${_esc(t('notifications.mark_read'))}">
      <i class="bi bi-check-circle" aria-hidden="true"></i>
    </button>` : ''}
    <button class="notif-action-btn" data-action="archive" data-id="${n.notificationId}"
            title="${_esc(t('notifications.archive'))}" aria-label="${_esc(t('notifications.archive'))}">
      <i class="bi bi-archive" aria-hidden="true"></i>
    </button>` : `
    <button class="notif-action-btn" data-action="dismiss" data-id="${n.notificationId}"
            title="${_esc(t('notifications.dismiss'))}" aria-label="${_esc(t('notifications.dismiss'))}">
      <i class="bi bi-x-lg" aria-hidden="true"></i>
    </button>`;

  return `
    <div class="notif-item${unread ? ' notif-unread' : ''}" data-notif-id="${n.notificationId}">
      ${unread ? '<span class="notif-unread-dot" aria-label="غير مقروء"></span>' : ''}
      <span class="notif-cat-icon ${cat.cls}" aria-hidden="true">
        <i class="bi bi-${cat.icon}"></i>
      </span>
      <div class="notif-content">
        <p class="notif-title">${_esc(n.title)}</p>
        <p class="notif-msg">${_esc(n.message)}</p>
        <div class="d-flex align-items-center gap-2 flex-wrap mt-1">
          <span class="notif-time">${_esc(time)}</span>
          <span class="notif-priority ${prio.cls}" aria-label="${_esc(t(prio.key))}">
            ${_esc(t(prio.key))}
          </span>
        </div>
      </div>
      <div class="notif-actions-row">
        ${actionsBefore}
        <button class="notif-action-btn danger" data-action="delete" data-id="${n.notificationId}"
                title="${_esc(t('notifications.delete'))}" aria-label="${_esc(t('notifications.delete'))}">
          <i class="bi bi-trash3" aria-hidden="true"></i>
        </button>
      </div>
    </div>`;
}

/* ── Render states ────────────────────────────────────────────────────────── */
function _showLoading() {
  elLoading?.classList.remove('d-none');
  elError?.classList.add('d-none');
  elList?.classList.add('d-none');
  elEmpty?.classList.add('d-none');
  elPagination?.classList.add('d-none');
}

function _showError(msg) {
  elLoading?.classList.add('d-none');
  elError?.classList.remove('d-none');
  if (elErrorMsg) elErrorMsg.textContent = msg;
  elList?.classList.add('d-none');
  elEmpty?.classList.add('d-none');
  elPagination?.classList.add('d-none');
}

function _showEmpty(filtered) {
  elLoading?.classList.add('d-none');
  elError?.classList.add('d-none');
  elList?.classList.add('d-none');
  elEmpty?.classList.remove('d-none');
  elPagination?.classList.add('d-none');
  if (elEmptyMsg) {
    elEmptyMsg.textContent = filtered
      ? t('notifications.empty_filtered')
      : t('notifications.empty');
  }
}

function _showList(items) {
  elLoading?.classList.add('d-none');
  elError?.classList.add('d-none');
  elEmpty?.classList.add('d-none');
  if (elList) {
    elList.innerHTML = items.map(_buildPageItem).join('');
    elList.classList.remove('d-none');
    _wireItemActions();
  }
}

/* ── Pagination ───────────────────────────────────────────────────────────── */
function _renderPagination() {
  if (!elPagination) return;
  if (_totalPages <= 1) { elPagination.classList.add('d-none'); return; }

  const isAr  = getLanguage() === 'ar';
  const prevIcon = isAr ? 'chevron-right' : 'chevron-left';
  const nextIcon = isAr ? 'chevron-left'  : 'chevron-right';

  let html = `
    <button class="notif-page-btn" data-page="${_currentPage - 1}"
            ${_currentPage <= 1 ? 'disabled' : ''} aria-label="السابق">
      <i class="bi bi-${prevIcon}" aria-hidden="true"></i>
    </button>`;

  const windowSize = 5;
  let start = Math.max(1, _currentPage - Math.floor(windowSize / 2));
  let end   = Math.min(_totalPages, start + windowSize - 1);
  if (end - start < windowSize - 1) start = Math.max(1, end - windowSize + 1);

  if (start > 1) {
    html += `<button class="notif-page-btn" data-page="1">1</button>`;
    if (start > 2) html += `<span class="notif-page-btn" style="cursor:default;border:none;">…</span>`;
  }
  for (let p = start; p <= end; p++) {
    html += `<button class="notif-page-btn${p === _currentPage ? ' active' : ''}" data-page="${p}">${p}</button>`;
  }
  if (end < _totalPages) {
    if (end < _totalPages - 1) html += `<span class="notif-page-btn" style="cursor:default;border:none;">…</span>`;
    html += `<button class="notif-page-btn" data-page="${_totalPages}">${_totalPages}</button>`;
  }

  html += `
    <button class="notif-page-btn" data-page="${_currentPage + 1}"
            ${_currentPage >= _totalPages ? 'disabled' : ''} aria-label="التالي">
      <i class="bi bi-${nextIcon}" aria-hidden="true"></i>
    </button>`;

  elPagination.innerHTML = html;
  elPagination.classList.remove('d-none');

  elPagination.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = Number(btn.dataset.page);
      if (!isNaN(p) && p >= 1 && p <= _totalPages && p !== _currentPage) {
        _currentPage = p;
        _loadNotifications();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

/* ── Per-item action wiring ───────────────────────────────────────────────── */
function _wireItemActions() {
  if (!elList) return;

  elList.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id     = Number(btn.dataset.id);

      if (action === 'delete') {
        if (!window.confirm(t('notifications.delete_confirm'))) return;
      }

      btn.disabled = true;
      const item = elList.querySelector(`[data-notif-id="${id}"]`);

      try {
        switch (action) {
          case 'mark-read':
            await NotificationService.markRead(id);
            if (item) {
              item.classList.remove('notif-unread');
              item.querySelector('.notif-unread-dot')?.remove();
              item.querySelector('[data-action="mark-read"]')?.remove();
            }
            if (_unreadCount > 0) _unreadCount--;
            _syncMarkAllBtn();
            showSuccess(t('notifications.mark_read_success'));
            break;

          case 'archive':
            await NotificationService.archive(id);
            item?.remove();
            showSuccess(t('notifications.archive_success'));
            _checkEmptyAfterRemove();
            break;

          case 'dismiss':
            await NotificationService.dismiss(id);
            item?.remove();
            showSuccess(t('notifications.dismiss_success'));
            _checkEmptyAfterRemove();
            break;

          case 'delete':
            await NotificationService.deleteNotification(id);
            item?.remove();
            showSuccess(t('notifications.delete_success'));
            _checkEmptyAfterRemove();
            break;
        }
      } catch {
        showError(t('errors.unknown'));
        btn.disabled = false;
      }
    });
  });
}

function _checkEmptyAfterRemove() {
  const remaining = elList?.querySelectorAll('.notif-item').length ?? 0;
  if (remaining === 0) {
    const isFiltered = _currentFilter !== 'all';
    _showEmpty(isFiltered);
    _syncMarkAllBtn();
  }
}

/* ── Mark all read ────────────────────────────────────────────────────────── */
function _syncMarkAllBtn() {
  if (!elMarkAllBtn) return;
  const hasUnread = elList?.querySelector('.notif-unread') !== null || _unreadCount > 0;
  elMarkAllBtn.classList.toggle('d-none', !hasUnread || _currentFilter === 'archived');
}

async function _handleMarkAllRead() {
  if (!elMarkAllBtn || elMarkAllBtn.disabled) return;
  Loader.setButtonLoading(elMarkAllBtn);
  try {
    await NotificationService.markAllRead();
    _unreadCount = 0;
    elList?.querySelectorAll('.notif-item.notif-unread').forEach(el => {
      el.classList.remove('notif-unread');
      el.querySelector('.notif-unread-dot')?.remove();
      el.querySelector('[data-action="mark-read"]')?.remove();
    });
    elMarkAllBtn.classList.add('d-none');
    showSuccess(t('notifications.mark_all_read_success'));
  } catch {
    showError(t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(elMarkAllBtn);
  }
}

/* ── Data loading ─────────────────────────────────────────────────────────── */
async function _loadNotifications() {
  if (_loading) return;
  _loading = true;
  _showLoading();

  const status = FILTER_STATUS_MAP[_currentFilter] ?? null;

  try {
    const data  = await NotificationService.getList({
      status,
      pageNumber: _currentPage,
      pageSize:   PAGE_SIZE,
    });

    const items      = data?.items      ?? [];
    _totalCount      = data?.totalCount ?? 0;
    _unreadCount     = data?.unreadCount ?? 0;
    _totalPages      = Math.max(1, Math.ceil(_totalCount / PAGE_SIZE));

    if (!items.length) {
      _showEmpty(_currentFilter !== 'all');
    } else {
      _showList(items);
      _renderPagination();
    }

    _syncMarkAllBtn();
  } catch (err) {
    _showError(t('errors.unknown'));
  } finally {
    _loading = false;
  }
}

/* ── Filter wiring ────────────────────────────────────────────────────────── */
function _wireFilters() {
  elFilters?.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.filter === _currentFilter) return;
      _currentFilter = btn.dataset.filter;
      _currentPage   = 1;
      elFilters.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _loadNotifications();
    });
  });
}

/* ── Init ─────────────────────────────────────────────────────────────────── */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  await initWorkspaceContext({
    viewPerm: 'view_notifications',
  });
  _wireFilters();
  elMarkAllBtn?.addEventListener('click', _handleMarkAllRead);
  await _loadNotifications();
  initOnboarding();
}

document.addEventListener('mm-currency-change', () => {
  _loadNotifications();
});

init();
