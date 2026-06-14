/**
 * pages/transactions.js — MyMoney
 * Transactions management: filtering, sorting, paging, analytics, CRUD.
 */

import { initI18n, t, getLanguage }  from '../core/i18n.js';
import { initLayout }                 from '../components/layout.js';
import { guardPage }                  from '../core/auth.js';
import { TransactionService }         from '../services/transaction-service.js';
import { CategoryService }            from '../services/category-service.js';
import { ApiError }                   from '../core/api.js';
import { showToast, showSuccess, showError } from '../components/toast.js';
import {
  incomeColors, expenseColors, chartPalette,
  chartTooltipOptions, chartLegendLabels, chartScales, chartSurfaceColor,
} from '../core/chart-theme.js';

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
const _s = {
  sortBy:      'Date',
  sortDir:     'DESC',
  page:        1,
  pageSize:    20,
  totalCount:  0,
  typeId:      null,
  categoryId:  null,
  dateFrom:    null,
  dateTo:      null,
  amountMin:   null,
  amountMax:   null,
  search:      '',
  preset:      'this_month',
  categories:  [],
  analyticsVisible: false,
  analyticsLoaded:  false,
  editingId:   null,
};

/* --------------------------------------------------------------------------
   Charts
   -------------------------------------------------------------------------- */
let _trendChart = null;
let _donutChart = null;

/* --------------------------------------------------------------------------
   Bootstrap modal refs
   -------------------------------------------------------------------------- */
let _txModal     = null;
let _deleteModal = null;
let _pendingDeleteId = null;

/* --------------------------------------------------------------------------
   Debounce timer
   -------------------------------------------------------------------------- */
let _searchTimer = null;

/* --------------------------------------------------------------------------
   Analytics data cache — kept so charts rebuild on theme change without
   a new network request.
   -------------------------------------------------------------------------- */
let _lastAnalyticsData = null;

/* ==========================================================================
   Date preset helpers
   ========================================================================== */
function _presetDates(key) {
  const now   = new Date();
  const today = _isoDate(now);
  if (key === 'today')      return { from: today, to: today };
  if (key === '7d')         { const d = new Date(now); d.setDate(d.getDate()-6);  return { from: _isoDate(d), to: today }; }
  if (key === '30d')        { const d = new Date(now); d.setDate(d.getDate()-29); return { from: _isoDate(d), to: today }; }
  if (key === 'this_month') return { from: `${now.getFullYear()}-${_pad(now.getMonth()+1)}-01`, to: today };
  if (key === 'last_month') {
    const y = now.getMonth() === 0 ? now.getFullYear()-1 : now.getFullYear();
    const m = now.getMonth() === 0 ? 12 : now.getMonth();
    const last = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    return { from: `${y}-${_pad(m)}-01`, to: `${y}-${_pad(m)}-${_pad(last)}` };
  }
  if (key === 'this_year')  return { from: `${now.getFullYear()}-01-01`, to: today };
  return null; // 'all' or 'custom' — no auto dates
}

function _isoDate(d) { return d.toISOString().split('T')[0]; }
function _pad(n)     { return String(n).padStart(2, '0'); }

/* ==========================================================================
   Formatting
   ========================================================================== */
function _fmtCurrency(amount) {
  const lang = getLanguage();
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-JO' : 'en-US', {
    style: 'currency', currency: 'JOD', minimumFractionDigits: 3,
  }).format(amount);
}

function _fmtDate(dateStr) {
  const lang = getLanguage();
  const d = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-JO' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(d);
}

function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/* ==========================================================================
   Category helpers
   ========================================================================== */
function _catName(cat) {
  return getLanguage() === 'ar' ? (cat.nameAr || cat.nameEn || '') : (cat.nameEn || cat.nameAr || '');
}

function _categoriesForType(typeId) {
  if (!typeId) return _s.categories;
  return _s.categories.filter(c => c.transactionTypeId === typeId);
}

/* ==========================================================================
   DOM helpers
   ========================================================================== */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function _show(el) { el?.classList.remove('d-none'); }
function _hide(el) { el?.classList.add('d-none'); }

/* ==========================================================================
   Filter category dropdown
   ========================================================================== */
function _renderFilterCategories() {
  const sel  = $('filterCategory');
  const typeId = _s.typeId;
  const cats = _categoriesForType(typeId);
  const prev = sel.value;

  sel.innerHTML = `<option value="">${t('transactions.filter_category_all')}</option>`;
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.categoryId;
    opt.textContent = _catName(c);
    sel.appendChild(opt);
  });

  // restore selection if still valid
  const still = cats.find(c => String(c.categoryId) === prev);
  sel.value = still ? prev : '';
  if (!still) _s.categoryId = null;
}

/* ==========================================================================
   Modal category dropdown — filtered by the selected transaction type.
   ========================================================================== */
function _renderModalCategories(typeId, selectedId) {
  const sel  = $('txCategory');
  const cats = _categoriesForType(typeId);

  sel.innerHTML = `<option value="">${t('transactions.modal_field_category_placeholder')}</option>`;
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value       = c.categoryId;
    opt.textContent = _catName(c);
    if (Number(c.categoryId) === Number(selectedId)) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* ==========================================================================
   Summary strip
   ========================================================================== */
function _renderSummary(summary) {
  const netVal = summary.netAmount ?? (summary.totalIncome - summary.totalExpenses);
  $('kpiIncome').textContent   = _fmtCurrency(summary.totalIncome   ?? 0);
  $('kpiExpenses').textContent = _fmtCurrency(summary.totalExpenses ?? 0);

  const netEl = $('kpiNet');
  netEl.textContent = _fmtCurrency(netVal);
  netEl.className   = 'kpi-value ' + (netVal >= 0 ? 'tx-amount-income' : 'tx-amount-expense');
  $('kpiCount').textContent = summary.totalCount ?? 0;
}

/* ==========================================================================
   Table rows
   ========================================================================== */
function _renderTable(items) {
  const tbody = $('txTbody');
  if (!items?.length) {
    tbody.innerHTML = '';
    _hide($('txTableWrap'));
    _show($('txEmpty'));
    _hide($('txPagination'));
    return;
  }

  _show($('txTableWrap'));
  _hide($('txEmpty'));
  _show($('txPagination'));

  const lang = getLanguage();
  tbody.innerHTML = items.map(tx => {
    const isIncome = tx.transactionTypeId === 1;
    const catName  = lang === 'ar' ? (tx.categoryNameAr || tx.categoryNameEn) : (tx.categoryNameEn || tx.categoryNameAr);
    const typeBadge = isIncome
      ? `<span class="tx-badge tx-badge-income"><i class="bi bi-arrow-down-circle-fill"></i>${t('transactions.type_income')}</span>`
      : `<span class="tx-badge tx-badge-expense"><i class="bi bi-arrow-up-circle-fill"></i>${t('transactions.type_expense')}</span>`;
    const catIconCls = isIncome ? 'tx-cat-income' : 'tx-cat-expense';
    const catIcon = tx.categoryIcon
      ? `<img src="/assets/images/categories/${_esc(tx.categoryIcon)}" width="18" alt="" class="me-1">`
      : `<i class="bi bi-tag-fill"></i>`;

    const amtCls = isIncome ? 'tx-amount-income' : 'tx-amount-expense';
    const amtSign = isIncome ? '+' : '−';

    return `<tr>
      <td class="text-nowrap">${_fmtDate(tx.transactionDate)}</td>
      <td>${typeBadge}</td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="tx-cat-icon ${catIconCls}">${catIcon}</span>
          <span>${_esc(catName)}</span>
        </div>
      </td>
      <td><span class="tx-desc" title="${_esc(tx.description)}">${_esc(tx.description) || '<span class="text-muted">—</span>'}</span></td>
      <td class="text-end">
        <span class="tx-amount ${amtCls}">${amtSign} ${_fmtCurrency(tx.amount)}</span>
      </td>
      <td class="text-center">
        <div class="d-flex justify-content-center gap-1">
          <button class="btn-row-action btn-row-edit"
            data-action="edit" data-id="${tx.transactionId}"
            title="${t('common.edit')}"><i class="bi bi-pencil-fill"></i></button>
          <button class="btn-row-action btn-row-delete"
            data-action="delete" data-id="${tx.transactionId}"
            title="${t('common.delete')}"><i class="bi bi-trash3-fill"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ==========================================================================
   Result count label
   ========================================================================== */
function _renderResultCount(totalCount) {
  const el = $('tableResultCount');
  if (!el) return;
  el.textContent = `${totalCount} ${t('transactions.pagination_rows')}`;
}

/* ==========================================================================
   Pagination
   ========================================================================== */
function _renderPagination(totalCount, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const infoEl   = $('paginationInfo');
  const listEl   = $('paginationList');

  const from = totalCount === 0 ? 0 : (page-1)*pageSize + 1;
  const to   = Math.min(page * pageSize, totalCount);
  infoEl.textContent = `${from}–${to} ${t('transactions.pagination_of')} ${totalCount}`;

  listEl.innerHTML = '';

  // Prev
  const prevLi = document.createElement('li');
  prevLi.className = `page-item ${page <= 1 ? 'disabled' : ''}`;
  prevLi.innerHTML = `<button class="page-link" data-page="${page-1}">${t('transactions.pagination_prev')}</button>`;
  listEl.appendChild(prevLi);

  // Page numbers (window of 5)
  const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
  const endPage   = Math.min(totalPages, startPage + 4);
  for (let p = startPage; p <= endPage; p++) {
    const li = document.createElement('li');
    li.className = `page-item ${p === page ? 'active' : ''}`;
    li.innerHTML = `<button class="page-link" data-page="${p}">${p}</button>`;
    listEl.appendChild(li);
  }

  // Next
  const nextLi = document.createElement('li');
  nextLi.className = `page-item ${page >= totalPages ? 'disabled' : ''}`;
  nextLi.innerHTML = `<button class="page-link" data-page="${page+1}">${t('transactions.pagination_next')}</button>`;
  listEl.appendChild(nextLi);

  // Bind page buttons
  listEl.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p >= 1 && p <= totalPages && p !== _s.page) {
        _s.page = p;
        _loadData();
      }
    });
  });
}

/* ==========================================================================
   Sort header
   ========================================================================== */
function _updateSortHeaders() {
  $$('.tx-table thead th[data-sort]').forEach(th => {
    const col = th.dataset.sort;
    th.classList.toggle('sorted', col === _s.sortBy);
    const icon = th.querySelector('.sort-icon');
    if (icon) {
      icon.className = _s.sortDir === 'ASC'
        ? 'bi bi-caret-up-fill sort-icon'
        : 'bi bi-caret-down-fill sort-icon';
    }
  });
}

/* ==========================================================================
   Preset active state
   ========================================================================== */
function _updatePresetUI() {
  $$('#presetBtns .preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === _s.preset);
  });
}

/* ==========================================================================
   Custom date row visibility
   ========================================================================== */
function _showCustomDateRow(show) {
  const row = $('customDateRow');
  if (show) row.classList.add('visible');
  else      row.classList.remove('visible');
}

/* ==========================================================================
   Apply preset
   ========================================================================== */
function _applyPreset(key) {
  _s.preset = key;
  _updatePresetUI();

  if (key === 'custom') {
    _showCustomDateRow(true);
    return; // wait for user to enter dates and click Apply
  }
  _showCustomDateRow(false);

  const dates = _presetDates(key);
  _s.dateFrom = dates?.from ?? null;
  _s.dateTo   = dates?.to   ?? null;

  // Sync custom date inputs
  if (_s.dateFrom) $('filterDateFrom').value = _s.dateFrom;
  if (_s.dateTo)   $('filterDateTo').value   = _s.dateTo;

  _s.page = 1;
  _loadData();
}

/* ==========================================================================
   Load categories
   ========================================================================== */
async function _loadCategories() {
  try {
    _s.categories = await CategoryService.getList() ?? [];
  } catch {
    _s.categories = [];
  }
  _renderFilterCategories();
}

/* ==========================================================================
   Load data (search + summary)
   ========================================================================== */
async function _loadData() {
  // Show skeletons, hide panels
  _show($('summarySkeletons'));
  _hide($('summaryStrip'));
  _show($('tableSkeletons'));
  _hide($('tablePanel'));

  const params = {
    typeId:      _s.typeId      || null,
    categoryId:  _s.categoryId  || null,
    dateFrom:    _s.dateFrom    || null,
    dateTo:      _s.dateTo      || null,
    amountMin:   _s.amountMin   || null,
    amountMax:   _s.amountMax   || null,
    search:      _s.search      || null,
    sortBy:      _s.sortBy,
    sortDir:     _s.sortDir,
    pageNumber:  _s.page,
    pageSize:    _s.pageSize,
  };

  try {
    const res = await TransactionService.search(params);
    _s.totalCount = res.totalCount ?? 0;

    _renderSummary(res.summary ?? {});
    _hide($('summarySkeletons'));
    _show($('summaryStrip'));

    _renderTable(res.items ?? []);
    _renderResultCount(res.totalCount ?? 0);
    _renderPagination(res.totalCount ?? 0, res.pageNumber ?? _s.page, res.pageSize ?? _s.pageSize);
    _updateSortHeaders();

    _hide($('tableSkeletons'));
    _show($('tablePanel'));

    // Invalidate analytics (filters changed)
    _s.analyticsLoaded = false;
    if (_s.analyticsVisible) _loadAnalytics();

  } catch (err) {
    _hide($('tableSkeletons'));
    _show($('tablePanel'));
    if (!(err instanceof ApiError)) {
      showError(t('transactions.toast_error'));
    }
  }
}

/* ==========================================================================
   Analytics
   ========================================================================== */
async function _loadAnalytics() {
  _show($('analyticsSkeletons'));
  _hide($('analyticsCharts'));

  const params = {
    dateFrom: _s.dateFrom || null,
    dateTo:   _s.dateTo   || null,
  };

  try {
    const res = await TransactionService.getAnalytics(params);
    _renderAnalytics(res);
    _s.analyticsLoaded = true;
  } catch {
    showError(t('transactions.toast_error'));
  } finally {
    _hide($('analyticsSkeletons'));
    _show($('analyticsCharts'));
  }
}

function _renderAnalytics(data) {
  _lastAnalyticsData = data;

  const lang = getLanguage();
  const breakdown = data.categoryBreakdown ?? [];
  const trend     = data.monthlyTrend      ?? [];

  /* ── Donut chart ─────────────────────────────────────────────────────── */
  if (!breakdown.length) {
    _show($('analyticsDonutEmpty'));
    _hide($('analyticsDonutWrap'));
  } else {
    _hide($('analyticsDonutEmpty'));
    _show($('analyticsDonutWrap'));

    if (_donutChart) { _donutChart.destroy(); _donutChart = null; }

    const palette = chartPalette();
    const colors  = palette.slice(0, breakdown.length);

    const donutCtx = $('donutChart').getContext('2d');
    _donutChart = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels:   breakdown.map(b => lang === 'ar' ? (b.nameAr || b.nameEn) : (b.nameEn || b.nameAr)),
        datasets: [{
          data:            breakdown.map(b => b.totalAmount),
          backgroundColor: colors,
          borderWidth:     2,
          borderColor:     chartSurfaceColor(),
          hoverOffset:     6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            ...chartTooltipOptions(),
            callbacks: {
              label: ctx => ` ${_fmtCurrency(ctx.parsed)} (${breakdown[ctx.dataIndex]?.percentage ?? 0}%)`,
            },
          },
        },
      },
    });

    const legend = $('donutLegend');
    legend.innerHTML = breakdown.map((b, i) => `
      <div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${colors[i % colors.length]};"></span>
        <span class="text-truncate">${_esc(lang === 'ar' ? (b.nameAr || b.nameEn) : (b.nameEn || b.nameAr))}</span>
        <span class="donut-legend-pct">${b.percentage ?? 0}%</span>
      </div>`).join('');
  }

  /* ── Trend bar chart ─────────────────────────────────────────────────── */
  if (!trend.length) {
    _show($('analyticsTrendEmpty'));
    _hide($('analyticsTrendWrap'));
  } else {
    _hide($('analyticsTrendEmpty'));
    _show($('analyticsTrendWrap'));

    if (_trendChart) { _trendChart.destroy(); _trendChart = null; }

    const labels = trend.map(p => {
      const key = `transactions.month_${p.month}`;
      return `${t(key)} ${p.year}`;
    });

    const inc = incomeColors();
    const exp = expenseColors();

    const trendCtx = $('trendChart').getContext('2d');
    _trendChart = new Chart(trendCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label:           t('transactions.analytics_trend_income'),
            data:            trend.map(p => p.income),
            backgroundColor: inc.backgroundColor,
            borderColor:     inc.borderColor,
            borderWidth:     1.5,
            borderRadius:    4,
          },
          {
            label:           t('transactions.analytics_trend_expenses'),
            data:            trend.map(p => p.expenses),
            backgroundColor: exp.backgroundColor,
            borderColor:     exp.borderColor,
            borderWidth:     1.5,
            borderRadius:    4,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', align: 'end', labels: chartLegendLabels() },
          tooltip: {
            ...chartTooltipOptions(),
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${_fmtCurrency(ctx.parsed.y)}` },
          },
        },
        scales: chartScales({ yCallback: v => _fmtCurrency(v) }),
      },
    });
  }
}

/* ==========================================================================
   CRUD — Add / Edit modal
   ========================================================================== */
function _openAddModal() {
  _s.editingId = null;
  $('txModalLabel').textContent = t('transactions.modal_add_title');
  $('txForm').reset();
  $('txForm').classList.remove('was-validated');

  document.getElementById('typeExpense').checked = true;
  _renderModalCategories(2, null);

  // Default date = today
  $('txDate').value = _isoDate(new Date());

  _txModal.show();
}

async function _openEditModal(id) {
  _s.editingId = id;
  $('txModalLabel').textContent = t('transactions.modal_edit_title');
  $('txForm').reset();
  $('txForm').classList.remove('was-validated');

  try {
    const tx = await TransactionService.getById(id);

    const typeId = Number(tx.transactionTypeId);
    document.getElementById(typeId === 1 ? 'typeIncome' : 'typeExpense').checked = true;
    _renderModalCategories(typeId, tx.categoryId);
    $('txAmount').value      = tx.amount;
    $('txDate').value        = tx.transactionDate;
    $('txDescription').value = tx.description ?? '';
    $('txNotes').value       = tx.notes ?? '';

    _txModal.show();
  } catch {
    showError(t('transactions.toast_error'));
  }
}

async function _saveTx() {
  const form = $('txForm');
  form.classList.add('was-validated');
  if (!form.checkValidity()) return;

  const typeId     = parseInt(document.querySelector('input[name="txType"]:checked').value, 10);
  const categoryId = parseInt($('txCategory').value, 10);
  const amount     = parseFloat($('txAmount').value);
  const date       = $('txDate').value;
  const description = $('txDescription').value.trim() || null;
  const notes       = $('txNotes').value.trim()       || null;

  const btnLabel = $('btnSaveTxLabel');
  btnLabel.textContent  = t('transactions.modal_saving');
  $('btnSaveTx').disabled = true;

  const payload = { transactionTypeId: typeId, categoryId, amount, transactionDate: date, description, notes };

  try {
    if (_s.editingId) {
      await TransactionService.update(_s.editingId, payload);
      showSuccess(t('transactions.toast_updated'));
    } else {
      await TransactionService.create(payload);
      showSuccess(t('transactions.toast_created'));
    }
    _txModal.hide();
    _s.page = 1;
    await _loadData();
  } catch (err) {
    if (err instanceof ApiError && err.errors?.length) {
      showError(err.errors[0]);
    } else {
      showError(t('transactions.toast_error'));
    }
  } finally {
    btnLabel.textContent    = t('transactions.modal_save');
    $('btnSaveTx').disabled = false;
  }
}

/* ==========================================================================
   CRUD — Delete
   ========================================================================== */
function _openDeleteModal(id) {
  _pendingDeleteId = id;
  _deleteModal.show();
}

async function _confirmDelete() {
  if (!_pendingDeleteId) return;

  const btnLabel = $('btnDeleteLabel');
  btnLabel.textContent          = t('transactions.modal_deleting');
  $('btnConfirmDelete').disabled = true;

  try {
    await TransactionService.remove(_pendingDeleteId);
    showSuccess(t('transactions.toast_deleted'));
    _deleteModal.hide();
    _s.page = 1;
    await _loadData();
  } catch {
    showError(t('transactions.toast_error'));
  } finally {
    btnLabel.textContent          = t('transactions.modal_delete_btn');
    $('btnConfirmDelete').disabled = false;
    _pendingDeleteId = null;
  }
}

/* ==========================================================================
   Event bindings
   ========================================================================== */
function _bindEvents() {
  /* Add button */
  $('btnAddTransaction').addEventListener('click', _openAddModal);

  /* Modal save */
  $('btnSaveTx').addEventListener('click', _saveTx);

  /* Modal type radio — re-populate categories for the selected type */
  $$('input[name="txType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      _renderModalCategories(parseInt(radio.value, 10), null);
    });
  });

  /* Delete confirm */
  $('btnConfirmDelete').addEventListener('click', _confirmDelete);

  /* Row actions (delegated) */
  $('txTbody').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id  = parseInt(btn.dataset.id, 10);
    if (btn.dataset.action === 'edit')   _openEditModal(id);
    if (btn.dataset.action === 'delete') _openDeleteModal(id);
  });

  /* Date presets */
  $$('#presetBtns .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => _applyPreset(btn.dataset.preset));
  });

  /* Custom date apply */
  $('btnApplyCustomDate').addEventListener('click', () => {
    _s.dateFrom = $('filterDateFrom').value || null;
    _s.dateTo   = $('filterDateTo').value   || null;
    _s.page     = 1;
    _loadData();
  });

  /* Type filter */
  $('filterType').addEventListener('change', e => {
    _s.typeId     = e.target.value ? parseInt(e.target.value, 10) : null;
    _s.categoryId = null;
    _s.page       = 1;
    _renderFilterCategories();
    _loadData();
  });

  /* Category filter */
  $('filterCategory').addEventListener('change', e => {
    _s.categoryId = e.target.value ? parseInt(e.target.value, 10) : null;
    _s.page       = 1;
    _loadData();
  });

  /* Amount filters */
  ['filterAmountMin', 'filterAmountMax'].forEach(id => {
    $(id).addEventListener('change', () => {
      _s.amountMin = $('filterAmountMin').value ? parseFloat($('filterAmountMin').value) : null;
      _s.amountMax = $('filterAmountMax').value ? parseFloat($('filterAmountMax').value) : null;
      _s.page = 1;
      _loadData();
    });
  });

  /* Search — debounced */
  $('filterSearch').addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      _s.search = e.target.value.trim();
      _s.page   = 1;
      _loadData();
    }, 400);
  });

  /* Sort by / dir selects */
  $('filterSortBy').addEventListener('change', e => {
    _s.sortBy = e.target.value;
    _s.page   = 1;
    _loadData();
  });
  $('filterSortDir').addEventListener('change', e => {
    _s.sortDir = e.target.value;
    _s.page    = 1;
    _loadData();
  });

  /* Sortable column headers */
  $$('.tx-table thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (col === _s.sortBy) {
        _s.sortDir = _s.sortDir === 'DESC' ? 'ASC' : 'DESC';
      } else {
        _s.sortBy  = col;
        _s.sortDir = 'DESC';
      }
      // Sync select dropdowns
      $('filterSortBy').value  = _s.sortBy;
      $('filterSortDir').value = _s.sortDir;
      _s.page = 1;
      _loadData();
    });
  });

  /* Page size */
  $('pageSizeSelect').addEventListener('change', e => {
    _s.pageSize = parseInt(e.target.value, 10);
    _s.page     = 1;
    _loadData();
  });

  /* Analytics toggle */
  $('btnToggleAnalytics').addEventListener('click', () => {
    _s.analyticsVisible = !_s.analyticsVisible;
    const body   = $('analyticsBody');
    const btnTxt = $('btnToggleAnalytics');
    if (_s.analyticsVisible) {
      _show(body);
      btnTxt.textContent = t('transactions.analytics_toggle_hide');
      if (!_s.analyticsLoaded) _loadAnalytics();
    } else {
      _hide(body);
      btnTxt.textContent = t('transactions.analytics_toggle_show');
    }
  });

  /* Clear filters */
  $('btnClearFilters').addEventListener('click', () => {
    _s.typeId     = null;
    _s.categoryId = null;
    _s.amountMin  = null;
    _s.amountMax  = null;
    _s.search     = '';

    $('filterType').value      = '';
    $('filterAmountMin').value = '';
    $('filterAmountMax').value = '';
    $('filterSearch').value    = '';
    _renderFilterCategories();

    _applyPreset('this_month');
  });
}

/* ==========================================================================
   i18n placeholder sync
   ========================================================================== */
function _syncPlaceholders() {
  $$('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

/* ==========================================================================
   Theme change — rebuild analytics charts without a network request
   ========================================================================== */
document.addEventListener('mm-theme-change', () => {
  if (_lastAnalyticsData && _s.analyticsVisible) {
    _renderAnalytics(_lastAnalyticsData);
  }
});

/* ==========================================================================
   Init
   ========================================================================== */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();

  _txModal     = new bootstrap.Modal($('txModal'));
  _deleteModal = new bootstrap.Modal($('deleteModal'));

  _syncPlaceholders();
  await _loadCategories();
  _bindEvents();

  // Default: this month
  _applyPreset('this_month');
}

init();
