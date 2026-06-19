/**
 * pages/recurring.js — MyMoney
 * Recurring Transactions & Subscriptions workspace.
 */

import { initI18n, t, getLanguage }     from '../core/i18n.js';
import { initLayout }                    from '../components/layout.js';
import { guardPage }                     from '../core/auth.js';
import { RecurringService }              from '../services/recurring-service.js';
import { CategoryService }               from '../services/category-service.js';
import { ApiError }                      from '../core/api.js';
import { showSuccess, showError }        from '../components/toast.js';

/* ── State ─────────────────────────────────────────────────────────────────── */
const _s = {
  activeTab:   'recurring',
  categories:  [],
  subLoaded:   false,

  recPage:     1,
  recPageSize: 20,
  recTotal:    0,
  recStatusId: null,
  recTypeId:   null,
  recSearch:   '',

  subPage:     1,
  subPageSize: 12,
  subTotal:    0,
  subStatusId: null,

  dashboard:   null,
  editingId:   null,
  deletingId:  null,
  deleteMode:  null,
};

let _recModal    = null;
let _subModal    = null;
let _deleteModal = null;
let _searchTimer = null;

/* ── DOM helpers ───────────────────────────────────────────────────────────── */
const $     = id  => document.getElementById(id);
const $$    = sel => document.querySelectorAll(sel);
const _show = el  => el?.classList.remove('d-none');
const _hide = el  => el?.classList.add('d-none');

/* ── Formatters ────────────────────────────────────────────────────────────── */
function _fmtCurrency(amount) {
  const lang = getLanguage();
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-JO' : 'en-US', {
    style: 'currency', currency: 'JOD', minimumFractionDigits: 3,
  }).format(amount ?? 0);
}

function _fmtDate(dateStr) {
  if (!dateStr) return '—';
  const lang = getLanguage();
  const d = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-JO' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(d);
}

function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function _isoDate(d) { return d.toISOString().split('T')[0]; }

/* ── Category helpers ──────────────────────────────────────────────────────── */
function _catName(cat) {
  return getLanguage() === 'ar'
    ? (cat.nameAr || cat.nameEn || '')
    : (cat.nameEn || cat.nameAr || '');
}

function _categoriesForType(typeId) {
  if (!typeId) return _s.categories;
  return _s.categories.filter(c => c.transactionTypeId === typeId);
}

/* ── Frequency / status helpers ────────────────────────────────────────────── */
const _FREQ_KEYS = ['', 'freq_daily', 'freq_weekly', 'freq_monthly', 'freq_quarterly', 'freq_yearly', 'freq_custom'];

function _freqLabel(freqId) {
  return t(`recurring.${_FREQ_KEYS[freqId] || 'freq_custom'}`);
}

function _statusBadgeCls(statusId) {
  if (statusId === 1) return 'tx-badge tx-badge-income';
  if (statusId === 2) return 'tx-badge tx-badge-expense';
  return 'tx-badge tx-badge-default';
}

function _statusLabel(statusId) {
  if (statusId === 1) return t('recurring.status_active');
  if (statusId === 2) return t('recurring.status_paused');
  return t('recurring.status_cancelled');
}

function _daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function _urgencyClass(days) {
  if (days === null) return '';
  if (days < 0)      return 'rec-urgency rec-urgency-overdue';
  if (days === 0)    return 'rec-urgency rec-urgency-today';
  if (days <= 2)     return 'rec-urgency rec-urgency-soon';
  if (days <= 7)     return 'rec-urgency rec-urgency-week';
  return 'rec-urgency rec-urgency-upcoming';
}

function _urgencyLabel(days) {
  if (days === null) return '';
  if (days < 0)  return t('recurring.urgency_overdue');
  if (days === 0) return t('recurring.urgency_today');
  if (days === 1) return t('recurring.urgency_tomorrow');
  return t('recurring.urgency_in_days', { n: days });
}

/* ── Next occurrences ──────────────────────────────────────────────────────── */
function _computeNextOccurrences(startDate, freqId, interval, unit, count = 3) {
  if (!startDate || !freqId) return [];
  const fId = parseInt(freqId, 10);
  const iv  = parseInt(interval, 10) || 1;
  const un  = parseInt(unit, 10) || 3;

  function advance(d) {
    const n = new Date(d);
    switch (fId) {
      case 1: n.setDate(n.getDate() + 1); break;
      case 2: n.setDate(n.getDate() + 7); break;
      case 3: n.setMonth(n.getMonth() + 1); break;
      case 4: n.setMonth(n.getMonth() + 3); break;
      case 5: n.setFullYear(n.getFullYear() + 1); break;
      case 6:
        if (un === 1)      n.setDate(n.getDate() + iv);
        else if (un === 2) n.setDate(n.getDate() + iv * 7);
        else               n.setMonth(n.getMonth() + iv);
        break;
    }
    return n;
  }

  let cur = new Date(startDate + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let guard = 0;
  while (cur < today && guard++ < 3650) cur = advance(cur);

  const results = [];
  for (let i = 0; i < count; i++) { results.push(new Date(cur)); cur = advance(cur); }
  return results;
}

/* ── KPIs ──────────────────────────────────────────────────────────────────── */
function _renderKpis(data) {
  $('kpiActiveRec').textContent       = data.activeRecurringCount    ?? 0;
  $('kpiActiveSub').textContent       = data.activeSubscriptionCount ?? 0;
  $('kpiMonthlyIncome').textContent   = _fmtCurrency(data.monthlyRecurringIncome    ?? 0);
  $('kpiMonthlyExpenses').textContent = _fmtCurrency(data.monthlyRecurringExpenses  ?? 0);

  const net   = data.netMonthlyRecurringCashFlow ?? 0;
  const netEl = $('kpiNetFlow');
  netEl.textContent = _fmtCurrency(net);
  netEl.className   = 'kpi-value ' + (net >= 0 ? 'tx-amount-income' : 'tx-amount-expense');

  $('kpiUpcoming').textContent = data.upcomingPaymentsCount ?? 0;

  const badge = $('upcomingCountBadge');
  const cnt   = data.upcomingPaymentsCount ?? 0;
  if (cnt > 0) { badge.textContent = cnt; _show(badge); } else _hide(badge);
}

/* ── Dashboard ─────────────────────────────────────────────────────────────── */
async function _loadDashboard() {
  try {
    const data   = await RecurringService.getDashboard();
    _s.dashboard = data;
    _renderKpis(data);
    _hide($('kpiSkeletons'));
    _show($('kpiStrip'));

    if (_s.activeTab === 'upcoming') {
      _hide($('upcomingSkeleton'));
      _show($('upcomingContent'));
      _renderUpcoming(data);
    }
  } catch {
    _hide($('kpiSkeletons'));
    _show($('kpiStrip'));
  }
}

/* ── Recurring list ────────────────────────────────────────────────────────── */
async function _loadRecurring() {
  _show($('recTableSkeleton'));
  _hide($('recTablePanel'));

  try {
    const res = await RecurringService.getList({
      statusId:          _s.recStatusId,
      transactionTypeId: _s.recTypeId,
      search:            _s.recSearch || null,
      pageNumber:        _s.recPage,
      pageSize:          _s.recPageSize,
    });

    _s.recTotal = res.totalCount ?? 0;
    _renderRecTable(res.items ?? []);
    _renderRecPagination(_s.recTotal, res.pageNumber ?? _s.recPage, res.pageSize ?? _s.recPageSize);
  } catch (err) {
    if (!(err instanceof ApiError)) showError(t('recurring.toast_error'));
  } finally {
    _hide($('recTableSkeleton'));
    _show($('recTablePanel'));
  }
}

function _renderRecTable(items) {
  const tbody = $('recTbody');

  if (!items.length) {
    tbody.innerHTML = '';
    _hide($('recTableWrap'));
    _hide($('recPaginationWrap'));
    _show($('recEmpty'));
    return;
  }

  _show($('recTableWrap'));
  _hide($('recEmpty'));

  tbody.innerHTML = items.map(item => {
    const isIncome  = item.transactionTypeId === 1;
    const amtCls    = isIncome ? 'tx-amount-income' : 'tx-amount-expense';
    const amtSign   = isIncome ? '+' : '−';
    const isPaused  = item.statusId === 2;
    const canToggle = item.statusId !== 3;
    const pauseIcon = isPaused ? 'bi-play-fill' : 'bi-pause-fill';
    const pauseAct  = isPaused ? 'resume-rec' : 'pause-rec';

    return `<tr>
      <td class="fw-medium">${_esc(item.name)}</td>
      <td>${isIncome
        ? `<span class="tx-badge tx-badge-income"><i class="bi bi-arrow-down-circle-fill"></i>${t('recurring.type_income')}</span>`
        : `<span class="tx-badge tx-badge-expense"><i class="bi bi-arrow-up-circle-fill"></i>${t('recurring.type_expense')}</span>`}
      </td>
      <td>${_esc(item.categoryName || item.categoryNameEn || item.categoryNameAr || '')}</td>
      <td class="text-nowrap">${_esc(item.frequencyName || _freqLabel(item.frequencyId))}</td>
      <td class="text-end text-nowrap"><span class="${amtCls}">${amtSign} ${_fmtCurrency(item.amount)}</span></td>
      <td class="text-nowrap">${item.nextOccurrence ? _fmtDate(item.nextOccurrence) : '—'}</td>
      <td><span class="${_statusBadgeCls(item.statusId)}">${_statusLabel(item.statusId)}</span></td>
      <td class="text-center">
        <div class="d-flex justify-content-center gap-1">
          <button class="btn-row-action btn-row-edit"
            data-action="edit-rec" data-id="${_esc(item.id)}"
            title="${t('common.edit')}"><i class="bi bi-pencil-fill"></i></button>
          ${canToggle ? `<button class="btn-row-action"
            data-action="${pauseAct}" data-id="${_esc(item.id)}" data-status="${item.statusId}"
            title="${isPaused ? t('recurring.resume_btn') : t('recurring.pause_btn')}"><i class="bi ${pauseIcon}"></i></button>` : ''}
          <button class="btn-row-action btn-row-delete"
            data-action="delete-rec" data-id="${_esc(item.id)}"
            title="${t('common.delete')}"><i class="bi bi-trash3-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function _renderRecPagination(total, page, size) {
  const wrap  = $('recPaginationWrap');
  const info  = $('recPaginationInfo');
  const list  = $('recPaginationList');
  const pages = Math.max(1, Math.ceil(total / size));

  if (total === 0) { _hide(wrap); return; }
  _show(wrap);

  info.textContent = `${(page-1)*size+1}–${Math.min(page*size, total)} ${t('recurring.pagination_of')} ${total}`;
  list.innerHTML   = '';

  const prevLi = document.createElement('li');
  prevLi.className = `page-item ${page <= 1 ? 'disabled' : ''}`;
  prevLi.innerHTML = `<button class="page-link" data-page="${page-1}">${t('recurring.pagination_prev')}</button>`;
  list.appendChild(prevLi);

  const start = Math.max(1, Math.min(page-2, pages-4));
  for (let p = start; p <= Math.min(pages, start+4); p++) {
    const li = document.createElement('li');
    li.className = `page-item ${p === page ? 'active' : ''}`;
    li.innerHTML = `<button class="page-link" data-page="${p}">${p}</button>`;
    list.appendChild(li);
  }

  const nextLi = document.createElement('li');
  nextLi.className = `page-item ${page >= pages ? 'disabled' : ''}`;
  nextLi.innerHTML = `<button class="page-link" data-page="${page+1}">${t('recurring.pagination_next')}</button>`;
  list.appendChild(nextLi);

  list.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p >= 1 && p <= pages && p !== _s.recPage) { _s.recPage = p; _loadRecurring(); }
    });
  });
}

/* ── Subscriptions list ────────────────────────────────────────────────────── */
async function _loadSubscriptions() {
  _show($('subSkeleton'));
  _hide($('subContent'));

  try {
    const res = await RecurringService.getSubscriptions({
      statusId:   _s.subStatusId,
      pageNumber: _s.subPage,
      pageSize:   _s.subPageSize,
    });

    _s.subTotal = res.totalCount ?? 0;
    _renderSubCards(res.items ?? []);
    _renderSubPagination(_s.subTotal, res.pageNumber ?? _s.subPage, res.pageSize ?? _s.subPageSize);
  } catch (err) {
    if (!(err instanceof ApiError)) showError(t('recurring.toast_error'));
  } finally {
    _hide($('subSkeleton'));
    _show($('subContent'));
  }
}

function _initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function _renderSubCards(items) {
  const grid = $('subGrid');

  if (!items.length) {
    grid.innerHTML = '';
    _show($('subEmpty'));
    _hide($('subPaginationWrap'));
    return;
  }

  _hide($('subEmpty'));

  const statusCardCls = { 1: 'rec-sub-active', 2: 'rec-sub-paused', 3: 'rec-sub-cancelled' };

  grid.innerHTML = items.map(item => {
    const days      = _daysUntil(item.renewalDate);
    const urgCls    = _urgencyClass(days);
    const urgLabel  = _urgencyLabel(days);
    const cardCls   = statusCardCls[item.statusId] || 'rec-sub-cancelled';
    const isPaused  = item.statusId === 2;
    const canToggle = item.statusId !== 3;
    const pauseIcon = isPaused ? 'bi-play-fill' : 'bi-pause-fill';
    const pauseAct  = isPaused ? 'resume-sub' : 'pause-sub';
    const freq      = _esc(item.frequencyName || _freqLabel(item.frequencyId));
    const catDisp   = _esc(item.categoryName || item.categoryNameEn || item.categoryNameAr || '');

    const renewalRow = item.renewalDate
      ? `<span class="text-muted small">${_fmtDate(item.renewalDate)}</span>
         ${urgLabel ? `<span class="${urgCls}">${urgLabel}</span>` : ''}`
      : `<span class="text-muted small">—</span>`;

    return `
    <div class="col-12 col-md-6 col-xl-4">
      <div class="rec-sub-card ${cardCls}">
        <div class="d-flex align-items-start gap-3 mb-3">
          <div class="rec-sub-avatar flex-shrink-0">${_esc(_initials(item.providerName))}</div>
          <div class="min-w-0 flex-grow-1">
            <p class="fw-semibold mb-0 text-truncate" title="${_esc(item.providerName)}">${_esc(item.providerName)}</p>
            <p class="text-muted small mb-0 text-truncate" title="${_esc(item.name)}">${_esc(item.name)}</p>
          </div>
          <span class="${_statusBadgeCls(item.statusId)} flex-shrink-0">${_statusLabel(item.statusId)}</span>
        </div>

        <div class="d-flex align-items-center justify-content-between mb-2">
          <div>
            <span class="tx-amount-expense fw-bold">${_fmtCurrency(item.amount)}</span>
            <span class="text-muted small ms-1">/ ${freq}</span>
          </div>
          <span class="rec-info-chip">${catDisp}</span>
        </div>

        <div class="mb-2">
          <span class="rec-section-label d-block mb-1" data-i18n="recurring.col_renewal_date">${t('recurring.col_renewal_date')}</span>
          <div class="d-flex align-items-center gap-2 flex-wrap">${renewalRow}</div>
        </div>

        <div class="d-flex align-items-center justify-content-between mt-3 pt-2" style="border-top:1px solid var(--mm-border);">
          <div class="d-flex align-items-center gap-1 text-muted small">
            <i class="bi ${item.autoRenew ? 'bi-arrow-repeat text-success' : 'bi-x-circle'}" aria-hidden="true"></i>
            <span>${t(item.autoRenew ? 'recurring.auto_renew_on' : 'recurring.auto_renew_off')}</span>
          </div>
          <div class="d-flex gap-1">
            <button class="btn-row-action btn-row-edit"
              data-action="edit-sub" data-id="${_esc(item.id)}"
              title="${t('common.edit')}"><i class="bi bi-pencil-fill"></i></button>
            ${canToggle ? `<button class="btn-row-action"
              data-action="${pauseAct}" data-id="${_esc(item.id)}" data-status="${item.statusId}"
              title="${isPaused ? t('recurring.resume_btn') : t('recurring.pause_btn')}"><i class="bi ${pauseIcon}"></i></button>` : ''}
            <button class="btn-row-action btn-row-delete"
              data-action="delete-sub" data-id="${_esc(item.id)}"
              title="${t('common.delete')}"><i class="bi bi-trash3-fill"></i></button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _renderSubPagination(total, page, size) {
  const wrap  = $('subPaginationWrap');
  const info  = $('subPaginationInfo');
  const list  = $('subPaginationList');
  const pages = Math.max(1, Math.ceil(total / size));

  if (total === 0) { _hide(wrap); return; }
  _show(wrap);

  info.textContent = `${(page-1)*size+1}–${Math.min(page*size, total)} ${t('recurring.pagination_of')} ${total}`;
  list.innerHTML   = '';

  const prevLi = document.createElement('li');
  prevLi.className = `page-item ${page <= 1 ? 'disabled' : ''}`;
  prevLi.innerHTML = `<button class="page-link" data-page="${page-1}">${t('recurring.pagination_prev')}</button>`;
  list.appendChild(prevLi);

  const start = Math.max(1, Math.min(page-2, pages-4));
  for (let p = start; p <= Math.min(pages, start+4); p++) {
    const li = document.createElement('li');
    li.className = `page-item ${p === page ? 'active' : ''}`;
    li.innerHTML = `<button class="page-link" data-page="${p}">${p}</button>`;
    list.appendChild(li);
  }

  const nextLi = document.createElement('li');
  nextLi.className = `page-item ${page >= pages ? 'disabled' : ''}`;
  nextLi.innerHTML = `<button class="page-link" data-page="${page+1}">${t('recurring.pagination_next')}</button>`;
  list.appendChild(nextLi);

  list.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p >= 1 && p <= pages && p !== _s.subPage) { _s.subPage = p; _loadSubscriptions(); }
    });
  });
}

/* ── Upcoming tab ──────────────────────────────────────────────────────────── */
function _renderUpcoming(data) {
  const payments = (data.upcomingPayments  ?? []).map(p => ({ ...p, _kind: 'payment', _date: p.dueDate }));
  const renewals = (data.upcomingRenewals  ?? []).map(r => ({ ...r, _kind: 'renewal', _date: r.renewalDate }));
  const combined = [...payments, ...renewals].sort((a, b) => new Date(a._date) - new Date(b._date));

  const listEl = $('upcomingList');

  if (!combined.length) {
    _show($('upcomingEmpty'));
    _hide(listEl);
    return;
  }

  _hide($('upcomingEmpty'));
  _show(listEl);

  listEl.innerHTML = combined.map(item => {
    const days      = _daysUntil(item._date);
    const urgCls    = _urgencyClass(days);
    const urgLabel  = _urgencyLabel(days);
    const isRenewal = item._kind === 'renewal';
    const isIncome  = !isRenewal && item.transactionTypeId === 1;
    const isOverdue = days !== null && days < 0;

    const iconCls = isRenewal
      ? 'rec-upcoming-icon rec-upcoming-icon-renewal'
      : (isOverdue ? 'rec-upcoming-icon rec-upcoming-icon-overdue' : 'rec-upcoming-icon rec-upcoming-icon-payment');
    const icon = isRenewal ? 'bi-arrow-clockwise'
      : (isIncome ? 'bi-arrow-down-circle-fill' : 'bi-arrow-up-circle-fill');
    const amtCls = (isRenewal || !isIncome) ? 'tx-amount-expense' : 'tx-amount-income';

    const label = isRenewal
      ? `${_esc(item.providerName || item.name)} · <span class="text-muted">${t('recurring.label_renewal')}</span>`
      : _esc(item.name);

    return `
    <div class="rec-upcoming-item">
      <div class="${iconCls}"><i class="bi ${icon}" aria-hidden="true"></i></div>
      <div class="flex-grow-1 min-w-0">
        <p class="fw-medium mb-0">${label}</p>
        <p class="text-muted small mb-0">${_fmtDate(item._date)}</p>
      </div>
      <div class="d-flex flex-column align-items-end gap-1 flex-shrink-0">
        <span class="${amtCls} fw-semibold text-nowrap">${_fmtCurrency(item.amount)}</span>
        ${urgLabel ? `<span class="${urgCls}">${urgLabel}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ── Modal — category helper ───────────────────────────────────────────────── */
function _populateCategories(selectEl, typeId, selectedId) {
  const cats = _categoriesForType(typeId);
  selectEl.innerHTML = `<option value="">${t('recurring.field_category_ph')}</option>`;
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value       = c.categoryId;
    opt.textContent = _catName(c);
    if (Number(c.categoryId) === Number(selectedId)) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

/* ── Modal — Recurring frequency fields ────────────────────────────────────── */
function _updateRecFreqFields() {
  const freqId = parseInt($('recFrequencyId').value, 10);
  $('recDayOfWeekRow').classList.toggle('visible',  freqId === 2);
  $('recDayOfMonthRow').classList.toggle('visible', freqId === 3 || freqId === 4 || freqId === 5);
  $('recCustomRow').classList.toggle('visible',     freqId === 6);
  _updateNextOccurrencesPreview();
}

function _updateNextOccurrencesPreview() {
  if (_s.editingId) { _hide($('recNextOccurrences')); return; }
  const freqId    = parseInt($('recFrequencyId').value, 10);
  const startDate = $('recStartDate').value;
  if (!freqId || !startDate) { _hide($('recNextOccurrences')); return; }

  const dates = _computeNextOccurrences(startDate, freqId,
    $('recFrequencyInterval').value, $('recFrequencyUnit').value, 3);

  if (!dates.length) { _hide($('recNextOccurrences')); return; }

  $('recNextOccurrencesList').innerHTML = dates.map((d, i) => `
    <div class="d-flex align-items-center gap-2">
      <span class="rec-occ-num">${i + 1}</span>
      <span class="text-muted small">${_fmtDate(_isoDate(d))}</span>
    </div>`).join('');

  _show($('recNextOccurrences'));
}

/* ── Recurring CRUD ────────────────────────────────────────────────────────── */
function _openAddRecurringModal() {
  _s.editingId = null;
  $('recModalLabel').textContent = t('recurring.modal_rec_add_title');
  $('recForm').reset();
  $('recForm').classList.remove('was-validated');

  _show($('recTypeRow'));
  _show($('recFrequencyRow'));
  _show($('recStartDateCol'));
  _hide($('recFixedNote'));
  _hide($('recNextOccurrences'));

  $('recDayOfWeekRow').classList.remove('visible');
  $('recDayOfMonthRow').classList.remove('visible');
  $('recCustomRow').classList.remove('visible');

  document.getElementById('recTypeExpense').checked = true;
  _populateCategories($('recCategory'), 2, null);
  $('recStartDate').value = _isoDate(new Date());

  _recModal.show();
}

async function _openEditRecurringModal(id) {
  _s.editingId = id;
  $('recModalLabel').textContent = t('recurring.modal_rec_edit_title');
  $('recForm').reset();
  $('recForm').classList.remove('was-validated');

  _hide($('recTypeRow'));
  _hide($('recFrequencyRow'));
  _hide($('recStartDateCol'));
  _show($('recFixedNote'));
  _hide($('recNextOccurrences'));
  $('recDayOfWeekRow').classList.remove('visible');
  $('recDayOfMonthRow').classList.remove('visible');
  $('recCustomRow').classList.remove('visible');

  try {
    const tx = await RecurringService.getById(id);
    _populateCategories($('recCategory'), tx.transactionTypeId, tx.categoryId);
    $('recName').value        = tx.name        ?? '';
    $('recAmount').value      = tx.amount       ?? '';
    $('recDescription').value = tx.description ?? '';
    $('recEndDate').value     = tx.endDate ? String(tx.endDate).split('T')[0] : '';
    $('recNotes').value       = tx.notes        ?? '';
    _recModal.show();
  } catch {
    showError(t('recurring.toast_error'));
  }
}

async function _saveRecurring() {
  const form = $('recForm');
  form.classList.add('was-validated');
  if (!form.checkValidity()) return;

  const btn      = $('btnSaveRec');
  const btnLabel = $('btnSaveRecLabel');
  btnLabel.textContent = t('recurring.saving_label');
  btn.disabled = true;

  try {
    if (_s.editingId) {
      await RecurringService.update({
        id:          _s.editingId,
        name:        $('recName').value.trim(),
        categoryId:  parseInt($('recCategory').value, 10),
        amount:      parseFloat($('recAmount').value),
        description: $('recDescription').value.trim() || null,
        endDate:     $('recEndDate').value || null,
        notes:       $('recNotes').value.trim() || null,
      });
      showSuccess(t('recurring.toast_updated'));
    } else {
      const freqId = parseInt($('recFrequencyId').value, 10);
      await RecurringService.create({
        name:              $('recName').value.trim(),
        transactionTypeId: parseInt(document.querySelector('input[name="recType"]:checked').value, 10),
        categoryId:        parseInt($('recCategory').value, 10),
        amount:            parseFloat($('recAmount').value),
        frequencyId:       freqId,
        frequencyInterval: freqId === 6 ? (parseInt($('recFrequencyInterval').value, 10) || 1) : null,
        frequencyUnit:     freqId === 6 ? (parseInt($('recFrequencyUnit').value, 10) || 3)  : null,
        dayOfWeek:         freqId === 2 ? parseInt($('recDayOfWeek').value, 10) : null,
        dayOfMonth:        [3,4,5].includes(freqId) ? (parseInt($('recDayOfMonth').value, 10) || null) : null,
        startDate:         $('recStartDate').value,
        endDate:           $('recEndDate').value || null,
        description:       $('recDescription').value.trim() || null,
        notes:             $('recNotes').value.trim() || null,
      });
      showSuccess(t('recurring.toast_created'));
    }
    _recModal.hide();
    _s.recPage = 1;
    await Promise.all([_loadRecurring(), _loadDashboard()]);
  } catch (err) {
    if (err instanceof ApiError && err.errors?.length) showError(err.errors[0]);
    else showError(t('recurring.toast_error'));
  } finally {
    btnLabel.textContent = t('recurring.save_btn');
    btn.disabled = false;
  }
}

/* ── Subscription CRUD ─────────────────────────────────────────────────────── */
function _updateSubFreqFields() {
  const freqId = parseInt($('subFrequencyId').value, 10);
  $('subCustomRow').classList.toggle('visible', freqId === 6);
}

function _openAddSubscriptionModal() {
  _s.editingId = null;
  $('subModalLabel').textContent = t('recurring.modal_sub_add_title');
  $('subForm').reset();
  $('subForm').classList.remove('was-validated');

  _show($('subCreateOnlyRow'));
  $('subCustomRow').classList.remove('visible');
  _populateCategories($('subCategory'), 2, null);
  $('subStartDate').value = _isoDate(new Date());
  $('subAutoRenew').checked = true;

  _subModal.show();
}

async function _openEditSubscriptionModal(id) {
  _s.editingId = id;
  $('subModalLabel').textContent = t('recurring.modal_sub_edit_title');
  $('subForm').reset();
  $('subForm').classList.remove('was-validated');

  _hide($('subCreateOnlyRow'));
  $('subCustomRow').classList.remove('visible');

  try {
    const tx  = await RecurringService.getById(id);
    const sub = tx.subscription ?? {};

    _populateCategories($('subCategory'), tx.transactionTypeId, tx.categoryId);
    $('subProvider').value    = sub.providerName ?? '';
    $('subName').value        = tx.name          ?? '';
    $('subAmount').value      = tx.amount         ?? '';
    $('subDescription').value = tx.description   ?? '';
    $('subEndDate').value     = tx.endDate    ? String(tx.endDate).split('T')[0]    : '';
    $('subRenewalDate').value = sub.renewalDate ? String(sub.renewalDate).split('T')[0] : '';
    $('subWebsite').value     = sub.website    ?? '';
    $('subAutoRenew').checked = sub.autoRenew  ?? true;
    $('subNotes').value       = tx.notes       ?? '';

    _subModal.show();
  } catch {
    showError(t('recurring.toast_error'));
  }
}

async function _saveSubscription() {
  const form = $('subForm');
  form.classList.add('was-validated');
  if (!form.checkValidity()) return;

  const btn      = $('btnSaveSub');
  const btnLabel = $('btnSaveSubLabel');
  btnLabel.textContent = t('recurring.saving_label');
  btn.disabled = true;

  try {
    if (_s.editingId) {
      await RecurringService.updateSubscription({
        id:           _s.editingId,
        name:         $('subName').value.trim(),
        categoryId:   parseInt($('subCategory').value, 10),
        amount:       parseFloat($('subAmount').value),
        providerName: $('subProvider').value.trim(),
        description:  $('subDescription').value.trim() || null,
        endDate:      $('subEndDate').value      || null,
        renewalDate:  $('subRenewalDate').value  || null,
        website:      $('subWebsite').value.trim() || null,
        autoRenew:    $('subAutoRenew').checked,
        notes:        $('subNotes').value.trim() || null,
      });
      showSuccess(t('recurring.toast_updated'));
    } else {
      const freqId = parseInt($('subFrequencyId').value, 10);
      await RecurringService.createSubscription({
        name:              $('subName').value.trim(),
        categoryId:        parseInt($('subCategory').value, 10),
        amount:            parseFloat($('subAmount').value),
        frequencyId:       freqId,
        frequencyInterval: freqId === 6 ? (parseInt($('subFrequencyInterval').value, 10) || 1) : null,
        frequencyUnit:     freqId === 6 ? (parseInt($('subFrequencyUnit').value, 10) || 3)  : null,
        startDate:         $('subStartDate').value,
        providerName:      $('subProvider').value.trim(),
        description:       $('subDescription').value.trim() || null,
        endDate:           $('subEndDate').value      || null,
        renewalDate:       $('subRenewalDate').value  || null,
        website:           $('subWebsite').value.trim() || null,
        autoRenew:         $('subAutoRenew').checked,
        notes:             $('subNotes').value.trim() || null,
      });
      showSuccess(t('recurring.toast_created'));
    }
    _subModal.hide();
    _s.subPage = 1;
    await Promise.all([_loadSubscriptions(), _loadDashboard()]);
  } catch (err) {
    if (err instanceof ApiError && err.errors?.length) showError(err.errors[0]);
    else showError(t('recurring.toast_error'));
  } finally {
    btnLabel.textContent = t('recurring.save_btn');
    btn.disabled = false;
  }
}

/* ── Delete ────────────────────────────────────────────────────────────────── */
function _openDeleteModal(id, mode) {
  _s.deletingId = id;
  _s.deleteMode = mode;
  $('deleteModalDesc').textContent = mode === 'rec'
    ? t('recurring.delete_rec_desc')
    : t('recurring.delete_sub_desc');
  _deleteModal.show();
}

async function _confirmDelete() {
  if (!_s.deletingId) return;
  const btn      = $('btnConfirmDelete');
  const btnLabel = $('btnConfirmDeleteLabel');
  btnLabel.textContent = t('recurring.deleting_label');
  btn.disabled = true;

  try {
    if (_s.deleteMode === 'rec') {
      await RecurringService.remove(_s.deletingId);
      _deleteModal.hide();
      _s.recPage = 1;
      await Promise.all([_loadRecurring(), _loadDashboard()]);
    } else {
      await RecurringService.removeSubscription(_s.deletingId);
      _deleteModal.hide();
      _s.subPage = 1;
      await Promise.all([_loadSubscriptions(), _loadDashboard()]);
    }
    showSuccess(t('recurring.toast_deleted'));
  } catch {
    showError(t('recurring.toast_error'));
  } finally {
    btnLabel.textContent = t('recurring.delete_btn');
    btn.disabled = false;
    _s.deletingId = null;
    _s.deleteMode = null;
  }
}

/* ── Pause / Resume ────────────────────────────────────────────────────────── */
async function _togglePause(id, currentStatusId, mode) {
  const isPaused = currentStatusId === 2;
  try {
    if (mode === 'rec') {
      if (isPaused) await RecurringService.resume(id);
      else          await RecurringService.pause(id);
      await Promise.all([_loadRecurring(), _loadDashboard()]);
    } else {
      if (isPaused) await RecurringService.resume(id);
      else          await RecurringService.pauseSubscription(id);
      await Promise.all([_loadSubscriptions(), _loadDashboard()]);
    }
    showSuccess(t(isPaused ? 'recurring.toast_resumed' : 'recurring.toast_paused'));
  } catch {
    showError(t('recurring.toast_error'));
  }
}

/* ── Tabs ──────────────────────────────────────────────────────────────────── */
const _PANELS = {
  recurring:     'tabPanelRecurring',
  subscriptions: 'tabPanelSubscriptions',
  upcoming:      'tabPanelUpcoming',
};

function _switchTab(name) {
  _s.activeTab = name;

  $$('.fil-tab-btn').forEach(btn => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  Object.entries(_PANELS).forEach(([key, panelId]) => {
    $(_PANELS[key]).classList.toggle('d-none', key !== name);
  });

  _hide($('btnAddRecurring'));
  _hide($('btnAddSubscription'));
  if (name === 'recurring')     _show($('btnAddRecurring'));
  if (name === 'subscriptions') _show($('btnAddSubscription'));

  if (name === 'subscriptions' && !_s.subLoaded) {
    _s.subLoaded = true;
    _loadSubscriptions();
  }

  if (name === 'upcoming') {
    if (_s.dashboard) {
      _hide($('upcomingSkeleton'));
      _show($('upcomingContent'));
      _renderUpcoming(_s.dashboard);
    }
  }
}

/* ── Event bindings ────────────────────────────────────────────────────────── */
function _bindEvents() {
  $('btnAddRecurring').addEventListener('click', _openAddRecurringModal);
  $('btnAddSubscription').addEventListener('click', _openAddSubscriptionModal);
  $('recEmptyAddBtn').addEventListener('click', _openAddRecurringModal);
  $('subEmptyAddBtn').addEventListener('click', _openAddSubscriptionModal);

  $('btnSaveRec').addEventListener('click', _saveRecurring);
  $('btnSaveSub').addEventListener('click', _saveSubscription);
  $('btnConfirmDelete').addEventListener('click', _confirmDelete);

  $$('input[name="recType"]').forEach(r =>
    r.addEventListener('change', () => _populateCategories($('recCategory'), parseInt(r.value, 10), null))
  );

  $('recFrequencyId').addEventListener('change', _updateRecFreqFields);
  $('recStartDate').addEventListener('change', _updateNextOccurrencesPreview);
  $('recFrequencyInterval').addEventListener('input', _updateNextOccurrencesPreview);
  $('recFrequencyUnit').addEventListener('change', _updateNextOccurrencesPreview);

  $('subFrequencyId').addEventListener('change', _updateSubFreqFields);

  $('recFilterStatus').addEventListener('change', e => {
    _s.recStatusId = e.target.value ? parseInt(e.target.value, 10) : null;
    _s.recPage = 1; _loadRecurring();
  });
  $('recFilterType').addEventListener('change', e => {
    _s.recTypeId = e.target.value ? parseInt(e.target.value, 10) : null;
    _s.recPage = 1; _loadRecurring();
  });
  $('recFilterSearch').addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      _s.recSearch = e.target.value.trim();
      _s.recPage = 1;
      _loadRecurring();
    }, 400);
  });
  $('recFilterClear').addEventListener('click', () => {
    _s.recStatusId = null; _s.recTypeId = null; _s.recSearch = '';
    $('recFilterStatus').value = '';
    $('recFilterType').value   = '';
    $('recFilterSearch').value = '';
    _s.recPage = 1; _loadRecurring();
  });

  $('subFilterStatus').addEventListener('change', e => {
    _s.subStatusId = e.target.value ? parseInt(e.target.value, 10) : null;
    _s.subPage = 1; _loadSubscriptions();
  });
  $('subFilterClear').addEventListener('click', () => {
    _s.subStatusId = null;
    $('subFilterStatus').value = '';
    _s.subPage = 1; _loadSubscriptions();
  });

  $('recTbody').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, status } = btn.dataset;
    if (action === 'edit-rec')   _openEditRecurringModal(id);
    if (action === 'delete-rec') _openDeleteModal(id, 'rec');
    if (action === 'pause-rec')  _togglePause(id, parseInt(status, 10), 'rec');
    if (action === 'resume-rec') _togglePause(id, parseInt(status, 10), 'rec');
  });

  $('subGrid').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, status } = btn.dataset;
    if (action === 'edit-sub')   _openEditSubscriptionModal(id);
    if (action === 'delete-sub') _openDeleteModal(id, 'sub');
    if (action === 'pause-sub')  _togglePause(id, parseInt(status, 10), 'sub');
    if (action === 'resume-sub') _togglePause(id, parseInt(status, 10), 'sub');
  });

  $$('.fil-tab-btn').forEach(btn =>
    btn.addEventListener('click', () => _switchTab(btn.dataset.tab))
  );

  // sync data-i18n-placeholder attributes after i18n is ready
  $$('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

/* ── Categories ────────────────────────────────────────────────────────────── */
async function _loadCategories() {
  try { _s.categories = await CategoryService.getList() ?? []; }
  catch { _s.categories = []; }
}

/* ── Init ──────────────────────────────────────────────────────────────────── */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();

  _recModal    = new bootstrap.Modal($('recModal'));
  _subModal    = new bootstrap.Modal($('subModal'));
  _deleteModal = new bootstrap.Modal($('deleteModal'));

  _show($('btnAddRecurring'));

  await _loadCategories();
  _bindEvents();

  await Promise.allSettled([
    _loadRecurring(),
    _loadDashboard(),
  ]);
}

init();
