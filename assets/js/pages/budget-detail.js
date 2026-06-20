/**
 * pages/budget-detail.js — MyMoney
 * Budget detail: header, current period KPIs, trend chart, paginated period history,
 * edit / pause / resume / delete handlers.
 */

import { initI18n, t, getLanguage }  from '../core/i18n.js';
import { initLayout }                 from '../components/layout.js';
import { guardPage }                  from '../core/auth.js';
import { BudgetService }              from '../services/budget-service.js';
import { ApiError }                   from '../core/api.js';
import { showSuccess, showError }     from '../components/toast.js';
import { Config }                     from '../core/config.js';
import {
  chartPalette, chartTooltipOptions, chartLegendLabels,
  chartScales, chartTextColor,
} from '../core/chart-theme.js';

/* --------------------------------------------------------------------------
   Constants / enums
   -------------------------------------------------------------------------- */
const PERIOD_TYPE   = { MONTHLY: 1, QUARTERLY: 2, YEARLY: 3 };
const STATUS        = { ACTIVE: 1, PAUSED: 2, ARCHIVED: 3 };
const HEALTH_BAND   = { POOR: 1, FAIR: 2, GOOD: 3, EXCELLENT: 4 };
const FORECAST_RISK = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const PERIOD_STATUS = { ACTIVE: 1, EXCEEDED: 2, CLOSED: 3 };

const PAGE_SIZE = 10;

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
const _s = {
  budgetId:   null,
  budget:     null,   // full getById response
  periods:    [],     // all periods (currentPeriod + history)
  page:       1,
  totalPages: 1,
};

let _trendChart = null;
let _editModal  = null;
let _deleteModal= null;

/* --------------------------------------------------------------------------
   Utility
   -------------------------------------------------------------------------- */
const $     = id  => document.getElementById(id);
const _show = el  => el?.classList.remove('d-none');
const _hide = el  => el?.classList.add('d-none');

function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function _lang() { return getLanguage(); }

function _fmtCurrency(val) {
  return new Intl.NumberFormat(_lang() === 'ar' ? 'ar-JO' : 'en-US', {
    style: 'currency', currency: 'JOD', minimumFractionDigits: 3,
  }).format(val ?? 0);
}

function _fmtPct(val) {
  return new Intl.NumberFormat(_lang() === 'ar' ? 'ar-EG' : 'en-US', {
    minimumFractionDigits: 0, maximumFractionDigits: 1,
  }).format(val ?? 0) + '%';
}

function _fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat(_lang() === 'ar' ? 'ar-JO' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(d);
}

function _fmtMonthYear(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat(_lang() === 'ar' ? 'ar-EG' : 'en-US', {
    month: 'short', year: 'numeric',
  }).format(d);
}

function _today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _categoryName(b) {
  return _lang() === 'ar' ? (b.categoryNameAr || b.categoryNameEn || '') : (b.categoryNameEn || b.categoryNameAr || '');
}

/* --------------------------------------------------------------------------
   Domain label helpers
   -------------------------------------------------------------------------- */
function _typeLabel(typeId) {
  return t(['', 'budgets.type_fixed', 'budgets.type_percentage', 'budgets.type_annual', 'budgets.type_flexible'][typeId] || 'budgets.type_fixed');
}

function _periodTypeLabel(periodId) {
  return t(['', 'budgets.period_monthly', 'budgets.period_quarterly', 'budgets.period_yearly'][periodId] || 'budgets.period_monthly');
}

function _statusLabel(statusId) {
  return t(['', 'budgets.status_active', 'budgets.status_paused', 'budgets.status_archived'][statusId] || 'budgets.status_active');
}

function _healthLabel(bandId) {
  return t(['', 'budgets.health_poor', 'budgets.health_fair', 'budgets.health_good', 'budgets.health_excellent'][bandId] || 'budgets.health_good');
}

function _riskLabel(riskId) {
  return t(['', 'budgets.risk_low', 'budgets.risk_medium', 'budgets.risk_high'][riskId] || 'budgets.risk_low');
}

function _periodStatusLabel(statusId) {
  return t(['', 'budgets.period_status_active', 'budgets.period_status_exceeded', 'budgets.period_status_closed'][statusId] || 'budgets.period_status_active');
}

function _healthBandCls(bandId) {
  return ['', 'poor', 'fair', 'good', 'excellent'][bandId] || 'good';
}

function _periodStatusCls(statusId) {
  return ['', 'active', 'exceeded', 'closed'][statusId] || 'active';
}

function _riskBandCls(riskId) {
  return ['', 'risk-low', 'risk-medium', 'risk-high'][riskId] || 'risk-low';
}

/* --------------------------------------------------------------------------
   RTL-aware back arrow
   -------------------------------------------------------------------------- */
function _setBackArrow() {
  const icon = $('backArrowIcon');
  if (icon) icon.className = `bi bi-arrow-${_lang() === 'ar' ? 'right' : 'left'}`;
}

/* --------------------------------------------------------------------------
   Budget header
   -------------------------------------------------------------------------- */
function _renderHeader(b) {
  const bandCls   = b.currentPeriod ? _healthBandCls(b.currentPeriod.healthBandId) : 'good';
  const isPaused  = b.statusId === STATUS.PAUSED;
  const isArchived= b.statusId === STATUS.ARCHIVED;
  const catName   = _categoryName(b);

  // Icon
  const iconEl = $('detailIcon');
  if (iconEl) {
    iconEl.className = `budget-detail-icon health-${bandCls}`;
    iconEl.innerHTML = `<i class="bi bi-${_esc(b.categoryIcon || 'wallet2')}" aria-hidden="true"></i>`;
  }

  const nameEl = $('detailName');
  if (nameEl) nameEl.textContent = b.name ?? '';

  const catEl = $('detailCategory');
  if (catEl) catEl.textContent = catName;

  const typeEl = $('detailTypeBadge');
  if (typeEl) typeEl.textContent = _typeLabel(b.budgetTypeId);

  const periodEl = $('detailPeriodBadge');
  if (periodEl) periodEl.textContent = _periodTypeLabel(b.periodTypeId);

  const statusEl = $('detailStatusBadge');
  if (statusEl) {
    statusEl.textContent = _statusLabel(b.statusId);
    statusEl.className   = `budget-card-period-badge${isPaused ? ' badge-paused' : isArchived ? ' badge-archived' : ''}`;
  }

  // Health ring
  const ringEl  = $('detailHealthRing');
  const scoreEl = $('detailHealthScore');
  if (b.currentPeriod) {
    const score = b.currentPeriod.healthScore ?? 0;
    if (ringEl)  ringEl.className = `budget-health-ring-lg health-${bandCls}`;
    if (scoreEl) scoreEl.textContent = score;
  } else {
    if (ringEl)  ringEl.className = 'budget-health-ring-lg health-good';
    if (scoreEl) scoreEl.textContent = '—';
  }

  // Pause/Resume button
  const pauseBtn = $('detailPauseResumeBtn');
  if (pauseBtn) {
    if (isArchived) {
      pauseBtn.style.display = 'none';
    } else {
      pauseBtn.style.display = '';
      pauseBtn.dataset.status = String(b.statusId);
      pauseBtn.innerHTML = isPaused
        ? `<i class="bi bi-play-circle me-1"></i>${t('budgets.resume_btn')}`
        : `<i class="bi bi-pause-circle me-1"></i>${t('budgets.pause_btn')}`;
    }
  }
}

/* --------------------------------------------------------------------------
   Current period KPI strip
   -------------------------------------------------------------------------- */
function _renderPeriodKpis(b) {
  const p   = b.currentPeriod;
  const kpiWrap = $('detailPeriodKpis');
  const noP     = $('detailNoPeriod');
  if (!p) {
    _hide(kpiWrap);
    _show(noP);
    return;
  }
  _show(kpiWrap);
  _hide(noP);

  const bandCls = _healthBandCls(p.healthBandId);
  const riskCls = _riskBandCls(p.forecastRiskId);
  const isDark  = document.documentElement.getAttribute('data-theme') === 'dark';

  const items = [
    {
      icon: 'bi-bullseye',
      bg:   isDark ? '#1e3a5f' : '#dbeafe',
      clr:  isDark ? '#60a5fa' : '#1e40af',
      val:  _fmtCurrency(p.budgetedAmount),
      lbl:  'budgets.col_budgeted',
    },
    {
      icon: 'bi-credit-card',
      bg:   isDark ? '#450a0a' : '#fee2e2',
      clr:  isDark ? '#f87171' : '#991b1b',
      val:  _fmtCurrency(p.actualSpent),
      lbl:  'budgets.col_spent',
    },
    {
      icon: 'bi-wallet',
      bg:   isDark ? '#064e3b' : '#d1fae5',
      clr:  isDark ? '#34d399' : '#065f46',
      val:  _fmtCurrency(p.remainingAmount),
      lbl:  'budgets.col_remaining',
    },
    {
      icon: 'bi-graph-up',
      bg:   isDark ? '#2e1065' : '#ede9fe',
      clr:  isDark ? '#a78bfa' : '#5b21b6',
      val:  _fmtCurrency(p.projectedEndSpending),
      lbl:  'budgets.detail_projected',
    },
    {
      icon: 'bi-calendar-day',
      bg:   isDark ? '#1c3035' : '#cffafe',
      clr:  isDark ? '#22d3ee' : '#0e7490',
      val:  p.dailyBudgetRemaining != null ? _fmtCurrency(p.dailyBudgetRemaining) : '—',
      lbl:  'budgets.detail_daily_budget',
    },
    {
      icon: 'bi-shield-exclamation',
      bg:   isDark ? '#422006' : '#fef9c3',
      clr:  isDark ? '#fb923c' : '#854d0e',
      val:  _riskLabel(p.forecastRiskId),
      lbl:  'budgets.detail_forecast_risk',
    },
  ];

  kpiWrap.innerHTML = items.map(item => `
    <div class="col-6 col-md-4 col-lg-2">
      <div class="kpi-card h-100">
        <span class="kpi-icon" style="background:${item.bg};color:${item.clr}">
          <i class="bi ${item.icon}" aria-hidden="true"></i>
        </span>
        <span class="kpi-label">${t(item.lbl)}</span>
        <span class="kpi-value" style="font-size:0.875rem;">${_esc(item.val)}</span>
      </div>
    </div>`).join('');
}

/* --------------------------------------------------------------------------
   Trend chart (budget vs actual per period)
   -------------------------------------------------------------------------- */
function _renderTrendChart(periods) {
  if (_trendChart) { _trendChart.destroy(); _trendChart = null; }

  const canvas = $('detailTrendChart');
  const panel  = $('detailChartPanel');
  if (!canvas || !periods.length) {
    _hide(panel);
    return;
  }
  _show(panel);

  const labels   = periods.map(p => _fmtMonthYear(p.periodStart));
  const budgeted = periods.map(p => p.budgetedAmount ?? 0);
  const spent    = periods.map(p => p.actualSpent ?? 0);
  const health   = periods.map(p => p.healthScore  ?? 0);
  const pal      = chartPalette();

  _trendChart = new Chart(canvas.getContext('2d'), {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: t('budgets.chart_budgeted'),
          data: budgeted,
          backgroundColor: pal[0] + '33',
          borderColor: pal[0],
          borderWidth: 1.5,
          borderRadius: 4,
          order: 2,
          yAxisID: 'y',
        },
        {
          type: 'bar',
          label: t('budgets.chart_spent'),
          data: spent,
          backgroundColor: pal[1] + '33',
          borderColor: pal[1],
          borderWidth: 1.5,
          borderRadius: 4,
          order: 3,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: t('budgets.detail_health_score'),
          data: health,
          borderColor: pal[4],
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          order: 1,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend:  { position: 'top', align: 'end', labels: chartLegendLabels() },
        tooltip: { ...chartTooltipOptions(), callbacks: {
          label: ctx => {
            if (ctx.dataset.yAxisID === 'y2')
              return ` ${ctx.dataset.label}: ${ctx.parsed.y}`;
            return ` ${ctx.dataset.label}: ${_fmtCurrency(ctx.parsed.y)}`;
          },
        }},
      },
      scales: {
        ...chartScales({ yCallback: v => _fmtCurrency(v), showXGrid: false }),
        y2: {
          position: 'right',
          min: 0, max: 100,
          grid: { display: false },
          border: { color: 'transparent' },
          ticks: {
            color: chartTextColor(),
            font: { size: 11 },
            callback: v => v,
          },
        },
      },
    },
  });
}

/* --------------------------------------------------------------------------
   Period history table
   -------------------------------------------------------------------------- */
function _renderPeriodsTable() {
  const tbody     = $('periodsTbody');
  const wrap      = $('periodsTableWrap');
  const empty     = $('periodsEmpty');
  const loading   = $('periodsLoading');
  const pagination= $('periodsPagination');

  _hide(loading);

  if (!_s.periods.length) {
    _hide(wrap);
    _show(empty);
    return;
  }

  _show(wrap);
  _hide(empty);

  const start = (_s.page - 1) * PAGE_SIZE;
  const slice = _s.periods.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = slice.map(p => {
    const util    = Math.round(p.utilizationPct ?? 0);
    const bandCls = _healthBandCls(p.healthBandId);
    const stsCls  = _periodStatusCls(p.periodStatusId ?? PERIOD_STATUS.CLOSED);
    const over    = (p.overBudgetAmount ?? 0) > 0;

    return `<tr>
      <td class="text-nowrap">
        ${_esc(_fmtDate(p.periodStart))} – ${_esc(_fmtDate(p.periodEnd))}
      </td>
      <td class="text-end text-nowrap">${_fmtCurrency(p.budgetedAmount)}</td>
      <td class="text-end text-nowrap ${over ? 'text-danger fw-semibold' : ''}">${_fmtCurrency(p.actualSpent)}</td>
      <td class="text-end text-nowrap ${over ? 'text-danger' : 'text-success'}">${_fmtCurrency((p.budgetedAmount ?? 0) - (p.actualSpent ?? 0))}</td>
      <td style="min-width:100px">
        <div class="d-flex align-items-center gap-2">
          <div class="budget-progress-bar flex-grow-1" style="height:6px">
            <div class="budget-progress-fill ${util >= 100 ? 'pct-over' : util >= 80 ? 'pct-warning' : ''}"
                 style="width:${Math.min(util, 100)}%"></div>
          </div>
          <span class="text-muted" style="font-size:0.72rem;white-space:nowrap">${util}%</span>
        </div>
      </td>
      <td class="text-center">
        <span class="health-band-badge ${bandCls}">${_healthLabel(p.healthBandId)}</span>
      </td>
      <td class="text-center">
        <span class="period-status-badge ${stsCls}">${_periodStatusLabel(p.periodStatusId ?? PERIOD_STATUS.CLOSED)}</span>
      </td>
    </tr>`;
  }).join('');

  // Pagination
  if (_s.totalPages > 1) {
    _show(pagination);
    const info = $('periodsPaginationInfo');
    if (info) {
      info.textContent = `${start + 1}–${Math.min(start + PAGE_SIZE, _s.periods.length)} ${t('budgets.pagination_of')} ${_s.periods.length}`;
    }
    $('periodsPrevBtn').disabled = _s.page <= 1;
    $('periodsNextBtn').disabled = _s.page >= _s.totalPages;
  } else {
    _hide(pagination);
  }
}

/* --------------------------------------------------------------------------
   Load page data
   -------------------------------------------------------------------------- */
async function loadPage() {
  const params = new URLSearchParams(window.location.search);
  _s.budgetId  = params.get('id') ? Number(params.get('id')) : null;

  if (!_s.budgetId) {
    _hide($('detailSkeleton'));
    _show($('detailNotFound'));
    return;
  }

  _show($('detailSkeleton'));

  let budget = null;
  try {
    budget = await BudgetService.getById(_s.budgetId);
  } catch (err) {
    _hide($('detailSkeleton'));
    if (err instanceof ApiError) showError(err.message);
    else showError(t('budgets.error'));
    _show($('detailNotFound'));
    return;
  }

  _hide($('detailSkeleton'));

  if (!budget?.budgetId) {
    _show($('detailNotFound'));
    return;
  }

  _s.budget = budget;

  // Build combined periods list: currentPeriod first, then closed history
  const all = [];
  if (budget.currentPeriod) {
    all.push({ ...budget.currentPeriod, periodStatusId: budget.currentPeriod.periodStatusId ?? PERIOD_STATUS.ACTIVE });
  }
  if (Array.isArray(budget.history)) {
    budget.history.forEach(h => all.push({ ...h, periodStatusId: h.periodStatusId ?? PERIOD_STATUS.CLOSED }));
  }

  _s.periods    = all;
  _s.page       = 1;
  _s.totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));

  _show($('detailContent'));
  _setBackArrow();
  _renderHeader(budget);
  _renderPeriodKpis(budget);
  _renderPeriodsTable();

  // Chart uses only the history (closed periods) sorted ascending
  const chartData = [...(budget.history ?? [])].sort((a, b) => {
    return new Date(a.periodStart) - new Date(b.periodStart);
  });
  if (chartData.length) _renderTrendChart(chartData);
  else _hide($('detailChartPanel'));
}

/* --------------------------------------------------------------------------
   Edit
   -------------------------------------------------------------------------- */
function _openEdit() {
  const b = _s.budget;
  if (!b) return;
  $('editBudgetName').value        = b.name ?? '';
  $('editBudgetPeriodType').value  = String(b.periodTypeId ?? PERIOD_TYPE.MONTHLY);
  $('editBudgetAmount').value      = b.amount ?? '';
  $('editBudgetEndDate').value     = b.endDate ? String(b.endDate).split('T')[0] : '';
  $('editBudgetAutoRenew').checked = b.isAutoRenew ?? true;
  $('editBudgetNotes').value       = b.notes ?? '';
  _editModal.show();
}

async function _submitEdit() {
  const btn = $('editBudgetSaveBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('budgets.saving')}`;

  try {
    const amount = parseFloat($('editBudgetAmount').value);
    if (!amount || amount <= 0) throw new Error(t('budgets.error'));

    await BudgetService.update({
      id:           _s.budgetId,
      name:         $('editBudgetName').value.trim(),
      periodTypeId: parseInt($('editBudgetPeriodType').value, 10),
      amount,
      endDate:      $('editBudgetEndDate').value || null,
      isAutoRenew:  $('editBudgetAutoRenew').checked,
      notes:        $('editBudgetNotes').value.trim() || null,
    });

    _editModal.hide();
    showSuccess(t('budgets.updated_success'));
    await _reloadDetail();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('budgets.error')) : t('budgets.error'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('budgets.save_btn');
  }
}

/* --------------------------------------------------------------------------
   Pause / Resume
   -------------------------------------------------------------------------- */
async function _togglePauseResume() {
  const b = _s.budget;
  if (!b) return;
  try {
    if (b.statusId === STATUS.PAUSED) {
      await BudgetService.resume(_s.budgetId);
      showSuccess(t('budgets.resumed_success'));
    } else {
      await BudgetService.pause(_s.budgetId);
      showSuccess(t('budgets.paused_success'));
    }
    await _reloadDetail();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('budgets.error')) : t('budgets.error'));
  }
}

/* --------------------------------------------------------------------------
   Delete
   -------------------------------------------------------------------------- */
async function _confirmDelete() {
  const btn = $('deleteBudgetConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('budgets.deleting')}`;

  try {
    await BudgetService.deleteBudget(_s.budgetId);
    _deleteModal.hide();
    showSuccess(t('budgets.deleted_success'));
    window.location.href = Config.ROUTES.BUDGETS;
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('budgets.error')) : t('budgets.error'));
    btn.disabled = false;
    btn.textContent = t('budgets.delete_confirm_btn');
  }
}

/* --------------------------------------------------------------------------
   Reload detail after mutation
   -------------------------------------------------------------------------- */
async function _reloadDetail() {
  try {
    const budget = await BudgetService.getById(_s.budgetId);
    if (!budget?.budgetId) return;

    _s.budget = budget;

    const all = [];
    if (budget.currentPeriod) {
      all.push({ ...budget.currentPeriod, periodStatusId: budget.currentPeriod.periodStatusId ?? PERIOD_STATUS.ACTIVE });
    }
    if (Array.isArray(budget.history)) {
      budget.history.forEach(h => all.push({ ...h, periodStatusId: h.periodStatusId ?? PERIOD_STATUS.CLOSED }));
    }
    _s.periods    = all;
    _s.page       = 1;
    _s.totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));

    _renderHeader(budget);
    _renderPeriodKpis(budget);
    _renderPeriodsTable();

    const chartData = [...(budget.history ?? [])].sort((a, b) => new Date(a.periodStart) - new Date(b.periodStart));
    if (chartData.length) _renderTrendChart(chartData);
    else _hide($('detailChartPanel'));
  } catch { /* non-critical */ }
}

/* --------------------------------------------------------------------------
   Wire events
   -------------------------------------------------------------------------- */
function _wireEvents() {
  $('detailEditBtn')?.addEventListener('click', _openEdit);
  $('editBudgetSaveBtn')?.addEventListener('click', _submitEdit);

  $('detailPauseResumeBtn')?.addEventListener('click', _togglePauseResume);

  $('detailDeleteBtn')?.addEventListener('click', () => _deleteModal.show());
  $('deleteBudgetConfirmBtn')?.addEventListener('click', _confirmDelete);

  $('periodsPrevBtn')?.addEventListener('click', () => {
    if (_s.page > 1) { _s.page--; _renderPeriodsTable(); }
  });
  $('periodsNextBtn')?.addEventListener('click', () => {
    if (_s.page < _s.totalPages) { _s.page++; _renderPeriodsTable(); }
  });

  document.addEventListener('mm-theme-change', () => {
    if (!_s.budget) return;
    const chartData = [...(_s.budget.history ?? [])].sort((a, b) => new Date(a.periodStart) - new Date(b.periodStart));
    if (chartData.length) _renderTrendChart(chartData);
  });
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();

  _editModal   = new bootstrap.Modal($('editBudgetModal'));
  _deleteModal = new bootstrap.Modal($('deleteBudgetModal'));

  _wireEvents();
  await loadPage();
}

init();
