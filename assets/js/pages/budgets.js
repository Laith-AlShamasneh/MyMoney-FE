/**
 * pages/budgets.js — MyMoney
 * Budget dashboard: KPI strip, budget cards, bar + donut charts,
 * 3-step creation wizard, edit/delete/pause/resume operations.
 */

import { initI18n, t, getLanguage }  from '../core/i18n.js';
import { initLayout }                 from '../components/layout.js';
import { guardPage }                  from '../core/auth.js';
import { BudgetService }              from '../services/budget-service.js';
import { ApiError, post }             from '../core/api.js';
import { showSuccess, showError }     from '../components/toast.js';
import { Config }                     from '../core/config.js';
import { formatAmount }               from '../core/currency.js';
import {
  chartPalette, chartTooltipOptions, chartLegendLabels,
  chartScales, incomeColors, expenseColors, chartSurfaceColor,
} from '../core/chart-theme.js';

/* --------------------------------------------------------------------------
   Constants / enums
   -------------------------------------------------------------------------- */
const BUDGET_TYPE   = { FIXED: 1, PERCENTAGE: 2, ANNUAL: 3, FLEXIBLE: 4 };
const PERIOD_TYPE   = { MONTHLY: 1, QUARTERLY: 2, YEARLY: 3 };
const STATUS        = { ACTIVE: 1, PAUSED: 2, ARCHIVED: 3 };
const HEALTH_BAND   = { POOR: 1, FAIR: 2, GOOD: 3, EXCELLENT: 4 };
const FORECAST_RISK = { LOW: 1, MEDIUM: 2, HIGH: 3 };

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
const _s = {
  dashboard:    null,   // full dashboard response
  budgets:      [],     // filtered displayed list
  allBudgets:   [],     // unfiltered list from dashboard
  categories:   [],     // for create/edit dropdowns
  filterStatus: null,
  filterSearch: '',
  actionId:     null,   // budget id being edited/deleted
  wStep:        1,      // wizard step
  wType:        null,   // wizard selected budget type
};

let _barChart    = null;
let _donutChart  = null;
let _wizardModal = null;
let _editModal   = null;
let _deleteModal = null;

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
  return formatAmount(val ?? 0);
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

function _periodLabel(periodId) {
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

function _healthBandCls(bandId) {
  return ['', 'poor', 'fair', 'good', 'excellent'][bandId] || 'good';
}

function _riskBandCls(riskId) {
  return ['', 'risk-low', 'risk-medium', 'risk-high'][riskId] || 'risk-low';
}

function _progressBarCls(pct) {
  if (pct >= 100) return 'pct-over';
  if (pct >= 95)  return 'pct-critical';
  if (pct >= 80)  return 'pct-warning';
  return '';
}

/* --------------------------------------------------------------------------
   KPI strip
   -------------------------------------------------------------------------- */
function _renderKpis(summary) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const items = [
    {
      icon: 'bi-wallet2',
      bg: isDark ? '#1e3a5f' : '#dbeafe',
      color: isDark ? '#60a5fa' : '#1e40af',
      val: summary.totalBudgets,
      lbl: 'budgets.kpi_active',
    },
    {
      icon: 'bi-cash-stack',
      bg: isDark ? '#064e3b' : '#d1fae5',
      color: isDark ? '#34d399' : '#065f46',
      val: _fmtCurrency(summary.totalBudgetedAmount),
      lbl: 'budgets.kpi_total_budgeted',
      currency: true,
    },
    {
      icon: 'bi-credit-card',
      bg: isDark ? '#450a0a' : '#fee2e2',
      color: isDark ? '#f87171' : '#991b1b',
      val: _fmtCurrency(summary.totalActualSpent),
      lbl: 'budgets.kpi_total_spent',
      currency: true,
    },
    {
      icon: 'bi-exclamation-triangle-fill',
      bg: isDark ? '#422006' : '#fef9c3',
      color: isDark ? '#fb923c' : '#854d0e',
      val: summary.exceededCount,
      lbl: 'budgets.kpi_over_budget',
    },
  ];

  $('budgetsKpiStrip').innerHTML = items.map(item => `
    <div class="budget-kpi-card">
      <div class="budget-kpi-icon" style="background:${item.bg};color:${item.color}">
        <i class="bi ${item.icon}" aria-hidden="true"></i>
      </div>
      <div>
        <div class="budget-kpi-val">${item.currency
          ? `<span style="font-size:0.85rem">${_esc(item.val)}</span>`
          : item.val}</div>
        <div class="budget-kpi-lbl">${t(item.lbl)}</div>
      </div>
    </div>`).join('');
}

/* --------------------------------------------------------------------------
   Budget card
   -------------------------------------------------------------------------- */
function _renderBudgetCard(b) {
  const p         = b.currentPeriod;
  const isPaused  = b.statusId === STATUS.PAUSED;
  const isArchived= b.statusId === STATUS.ARCHIVED;
  const bandCls   = p ? _healthBandCls(p.healthBandId) : 'good';
  const riskCls   = p ? _riskBandCls(p.forecastRiskId) : 'risk-low';
  const utilPct   = p ? Math.min(Math.round(p.utilizationPct ?? 0), 200) : 0;
  const barCls    = p ? _progressBarCls(p.utilizationPct ?? 0) : '';
  const catName   = _categoryName(b);

  const periodRange = p
    ? `${_fmtDate(p.periodStart)} – ${_fmtDate(p.periodEnd)}`
    : t('budgets.card_no_period');

  return `
<div class="col-12 col-md-6 col-xl-4">
  <div class="budget-card health-${bandCls}${isPaused ? ' budget-card-paused' : ''}${isArchived ? ' budget-card-archived' : ''}"
       data-budget-id="${b.budgetId}">
    <div class="budget-card-header">
      <div class="budget-card-meta">
        <span class="budget-card-type-badge">${_esc(_typeLabel(b.budgetTypeId))}</span>
        <span class="budget-card-period-badge">${_esc(_periodLabel(b.periodTypeId))}</span>
      </div>
      <div class="dropdown">
        <button class="budget-menu-btn" data-bs-toggle="dropdown" aria-expanded="false"
                aria-label="${_esc(t('budgets.edit_btn'))}">
          <i class="bi bi-three-dots-vertical" aria-hidden="true"></i>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm">
          <li><a class="dropdown-item budget-action-detail"
              href="${Config.ROUTES.BUDGET_DETAIL}?id=${b.budgetId}">
            <i class="bi bi-eye me-2 text-primary"></i>${t('budgets.view_btn')}
          </a></li>
          <li><button class="dropdown-item budget-action-edit" data-id="${b.budgetId}">
            <i class="bi bi-pencil me-2"></i>${t('budgets.edit_btn')}
          </button></li>
          <li><button class="dropdown-item budget-action-pause-resume" data-id="${b.budgetId}"
              data-status="${b.statusId}" ${isArchived ? 'disabled' : ''}>
            <i class="bi ${isPaused ? 'bi-play-circle' : 'bi-pause-circle'} me-2"></i>
            ${isPaused ? t('budgets.resume_btn') : t('budgets.pause_btn')}
          </button></li>
          <li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item text-danger budget-action-delete" data-id="${b.budgetId}">
            <i class="bi bi-trash me-2"></i>${t('budgets.delete_btn')}
          </button></li>
        </ul>
      </div>
    </div>

    <div class="budget-card-body">
      <div class="d-flex align-items-start gap-3 mb-3">
        ${b.categoryIcon
          ? `<div class="budget-card-icon"><i class="bi bi-${_esc(b.categoryIcon)}" aria-hidden="true"></i></div>`
          : `<div class="budget-card-icon"><i class="bi bi-wallet2" aria-hidden="true"></i></div>`
        }
        <div class="flex-grow-1 min-w-0">
          <h3 class="budget-card-name" title="${_esc(b.name)}">${_esc(b.name)}</h3>
          ${catName ? `<p class="budget-card-category text-muted small mb-0">${_esc(catName)}</p>` : ''}
        </div>
        ${p ? `<div class="budget-health-ring health-${bandCls}" title="${_healthLabel(p.healthBandId)}">
          <span class="budget-health-score">${p.healthScore}</span>
        </div>` : ''}
      </div>

      ${p ? `
      <div class="mb-2">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted" style="font-size:0.72rem;">${_fmtPct(utilPct)}</span>
          ${p.forecastRiskId > FORECAST_RISK.LOW
            ? `<span class="budget-risk-badge ${riskCls}">${_riskLabel(p.forecastRiskId)}</span>`
            : ''}
        </div>
        <div class="budget-progress-bar">
          <div class="budget-progress-fill ${barCls}" style="width:${Math.min(utilPct,100)}%"></div>
        </div>
      </div>
      <div class="budget-stats">
        <div class="budget-stat">
          <div class="budget-stat-val">${_fmtCurrency(p.budgetedAmount)}</div>
          <div class="budget-stat-lbl">${t('budgets.card_budgeted')}</div>
        </div>
        <div class="budget-stat">
          <div class="budget-stat-val ${p.utilizationPct >= 100 ? 'text-danger' : ''}">${_fmtCurrency(p.actualSpent)}</div>
          <div class="budget-stat-lbl">${t('budgets.card_spent')}</div>
        </div>
        <div class="budget-stat">
          <div class="budget-stat-val ${(p.remainingAmount ?? 0) < 0 ? 'text-danger' : 'text-success'}">${_fmtCurrency(p.remainingAmount)}</div>
          <div class="budget-stat-lbl">${t('budgets.card_remaining')}</div>
        </div>
      </div>` : `
      <div class="text-center py-3 text-muted small">
        <i class="bi bi-calendar-x d-block mb-1 fs-5" aria-hidden="true"></i>
        ${t('budgets.card_no_period')}
      </div>`}
    </div>

    <div class="budget-card-footer">
      <span class="text-muted" style="font-size:0.72rem;">
        <i class="bi bi-calendar3 me-1" aria-hidden="true"></i>${_esc(periodRange)}
      </span>
      <div class="d-flex align-items-center gap-2">
        ${b.isAutoRenew
          ? `<i class="bi bi-arrow-repeat text-muted" title="${t('budgets.auto_renew_on')}" aria-hidden="true"></i>`
          : ''}
        <span class="health-band-badge ${bandCls}">${_healthLabel(p?.healthBandId ?? HEALTH_BAND.GOOD)}</span>
      </div>
    </div>
  </div>
</div>`;
}

/* --------------------------------------------------------------------------
   Grid render + filter
   -------------------------------------------------------------------------- */
function _applyFilters() {
  let list = _s.allBudgets;

  if (_s.filterStatus !== null) {
    list = list.filter(b => b.statusId === _s.filterStatus);
  }

  if (_s.filterSearch) {
    const q = _s.filterSearch.toLowerCase();
    list = list.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (_categoryName(b) || '').toLowerCase().includes(q)
    );
  }

  _s.budgets = list;
}

function _renderGrid() {
  const grid = $('budgetsGrid');

  if (!_s.budgets.length) {
    grid.innerHTML = '';
    _show($('budgetsFilteredEmpty'));
    return;
  }

  _hide($('budgetsFilteredEmpty'));
  grid.innerHTML = _s.budgets.map(_renderBudgetCard).join('');
}

/* --------------------------------------------------------------------------
   Charts
   -------------------------------------------------------------------------- */
function _renderBarChart(trend) {
  if (_barChart) { _barChart.destroy(); _barChart = null; }

  const canvas = $('budgetBarChart');
  const empty  = $('budgetBarEmpty');
  if (!canvas) return;

  if (!trend?.length) {
    _hide(canvas);
    _show(empty);
    return;
  }
  _show(canvas);
  _hide(empty);

  const labels     = trend.map(pt => _fmtMonthYear(pt.periodStart));
  const budgeted   = trend.map(pt => pt.totalBudgeted ?? 0);
  const spent      = trend.map(pt => pt.totalSpent ?? 0);
  const inc        = incomeColors();
  const exp        = expenseColors();

  _barChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: t('budgets.chart_budgeted'),
          data:  budgeted,
          backgroundColor: inc.backgroundColor,
          borderColor:     inc.borderColor,
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          label: t('budgets.chart_spent'),
          data:  spent,
          backgroundColor: exp.backgroundColor,
          borderColor:     exp.borderColor,
          borderWidth: 1.5,
          borderRadius: 4,
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
          label: ctx => ` ${ctx.dataset.label}: ${_fmtCurrency(ctx.parsed.y)}`,
        }},
      },
      scales: chartScales({ yCallback: v => _fmtCurrency(v), showXGrid: false }),
    },
  });
}

function _renderDonutChart(budgets) {
  if (_donutChart) { _donutChart.destroy(); _donutChart = null; }

  const canvas = $('budgetDonutChart');
  const empty  = $('budgetDonutEmpty');
  if (!canvas) return;

  // Build category spending data from budgets with active periods
  const catMap = new Map();
  for (const b of budgets) {
    if (!b.currentPeriod || (b.currentPeriod.actualSpent ?? 0) === 0) continue;
    const name = _categoryName(b) || b.name;
    catMap.set(name, (catMap.get(name) ?? 0) + (b.currentPeriod.actualSpent ?? 0));
  }

  if (!catMap.size) {
    _hide(canvas);
    _show(empty);
    return;
  }
  _show(canvas);
  _hide(empty);

  const labels   = [...catMap.keys()];
  const values   = [...catMap.values()];
  const palette  = chartPalette();
  const surface  = chartSurfaceColor();

  _donutChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: palette.slice(0, labels.length),
        borderColor:     surface,
        borderWidth:     2,
        hoverOffset:     6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { ...chartLegendLabels(), boxWidth: 10, padding: 12 },
        },
        tooltip: { ...chartTooltipOptions(), callbacks: {
          label: ctx => ` ${ctx.label}: ${_fmtCurrency(ctx.parsed)}`,
        }},
      },
    },
  });
}

/* --------------------------------------------------------------------------
   Load page data
   -------------------------------------------------------------------------- */
async function _loadCategories() {
  try {
    const res = await post(Config.API.CATEGORY.LIST, { typeId: null });
    _s.categories = res ?? [];
  } catch { _s.categories = []; }
}

function _populateCategorySelects() {
  const opts = _s.categories.map(c => {
    const name = _lang() === 'ar' ? (c.nameAr || c.nameEn || '') : (c.nameEn || c.nameAr || '');
    return `<option value="${c.categoryId}">${_esc(name)}</option>`;
  }).join('');

  const emptyOpt = `<option value="">${t('budgets.field_category_ph')}</option>`;
  const selects = ['bwCategory', 'editBudgetCategory'];
  selects.forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = emptyOpt + opts;
  });
}

async function loadPage() {
  _show($('budgetsSkeleton'));

  let dashboard = null;
  try {
    dashboard = await BudgetService.getDashboard();
  } catch (err) {
    _hide($('budgetsSkeleton'));
    if (err instanceof ApiError) showError(err.message);
    else showError(t('budgets.error'));
    return;
  }

  _hide($('budgetsSkeleton'));
  _s.dashboard   = dashboard;
  _s.allBudgets  = dashboard?.budgets ?? [];

  const hasAny = _s.allBudgets.length > 0;

  if (!hasAny) {
    _show($('budgetsNoData'));
    return;
  }

  _show($('budgetsContent'));

  if (dashboard?.summary) _renderKpis(dashboard.summary);

  _applyFilters();
  _renderGrid();
  _renderBarChart(dashboard?.trend ?? []);
  _renderDonutChart(_s.allBudgets);
}

/* --------------------------------------------------------------------------
   Wizard
   -------------------------------------------------------------------------- */
function _wizSetStep(step) {
  _s.wStep = step;
  [1, 2, 3].forEach(i => {
    const panel = $(`bwStep${i}`);
    const node  = $(`bwNode${i}`);
    const dot   = $(`bwDot${i}`);
    if (panel) panel.classList.toggle('d-none', i !== step);
    if (!node || !dot) return;
    node.classList.remove('active', 'done');
    if (i < step)  { node.classList.add('done');  dot.innerHTML = '<i class="bi bi-check-lg"></i>'; }
    if (i === step){ node.classList.add('active'); dot.textContent = i; }
    if (i > step)  { dot.textContent = i; }
  });

  const backBtn   = $('bwBackBtn');
  const nextBtn   = $('bwNextBtn');
  const createBtn = $('bwCreateBtn');

  step > 1  ? _show(backBtn)   : _hide(backBtn);
  step < 3  ? _show(nextBtn)   : _hide(nextBtn);
  step === 3 ? _show(createBtn) : _hide(createBtn);

  if (step === 1) nextBtn.disabled = !_s.wType;
  if (step === 2) nextBtn.disabled = !$('bwName').value.trim();
  if (step === 3) createBtn.disabled = !(parseFloat($('bwAmount').value) > 0);
}

function _openWizard() {
  _s.wStep = 1; _s.wType = null;
  $('bwName').value       = '';
  $('bwCategory').value   = '';
  $('bwPeriodType').value = String(PERIOD_TYPE.MONTHLY);
  $('bwStartDate').value  = _today();
  $('bwEndDate').value    = '';
  $('bwAutoRenew').checked = true;
  $('bwAmount').value     = '';
  $('bwNotes').value      = '';

  document.querySelectorAll('#bwTypeGrid .budget-type-option')
    .forEach(c => c.classList.remove('selected'));

  _wizSetStep(1);
  $('bwNextBtn').disabled = true;
  _wizardModal.show();
}

async function _submitWizard() {
  const btn = $('bwCreateBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('budgets.wizard_creating')}`;

  try {
    const amount = parseFloat($('bwAmount').value);
    if (!amount || amount <= 0) throw new Error(t('budgets.error'));

    const payload = {
      name:         $('bwName').value.trim(),
      categoryId:   $('bwCategory').value ? Number($('bwCategory').value) : null,
      budgetTypeId: _s.wType,
      periodTypeId: parseInt($('bwPeriodType').value, 10),
      amount,
      startDate:    $('bwStartDate').value,
      endDate:      $('bwEndDate').value || null,
      isAutoRenew:  $('bwAutoRenew').checked,
      notes:        $('bwNotes').value.trim() || null,
    };

    await BudgetService.create(payload);
    _wizardModal.hide();
    showSuccess(t('budgets.created_success'));
    await _reloadAfterChange();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('budgets.error')) : t('budgets.error'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-check-circle me-2"></i><span>${t('budgets.wizard_create')}</span>`;
  }
}

/* --------------------------------------------------------------------------
   Edit
   -------------------------------------------------------------------------- */
function _openEdit(budgetId) {
  const b = _s.allBudgets.find(x => x.budgetId === budgetId);
  if (!b) return;
  _s.actionId = budgetId;

  $('editBudgetName').value        = b.name ?? '';
  $('editBudgetCategory').value    = b.categoryId ? String(b.categoryId) : '';
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
      id:           _s.actionId,
      name:         $('editBudgetName').value.trim(),
      categoryId:   $('editBudgetCategory').value ? Number($('editBudgetCategory').value) : null,
      periodTypeId: parseInt($('editBudgetPeriodType').value, 10),
      amount,
      endDate:      $('editBudgetEndDate').value || null,
      isAutoRenew:  $('editBudgetAutoRenew').checked,
      notes:        $('editBudgetNotes').value.trim() || null,
    });

    _editModal.hide();
    showSuccess(t('budgets.updated_success'));
    await _reloadAfterChange();
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
async function _togglePauseResume(budgetId, currentStatus) {
  try {
    if (currentStatus === STATUS.PAUSED) {
      await BudgetService.resume(budgetId);
      showSuccess(t('budgets.resumed_success'));
    } else {
      await BudgetService.pause(budgetId);
      showSuccess(t('budgets.paused_success'));
    }
    await _reloadAfterChange();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('budgets.error')) : t('budgets.error'));
  }
}

/* --------------------------------------------------------------------------
   Delete
   -------------------------------------------------------------------------- */
function _openDelete(budgetId) {
  _s.actionId = budgetId;
  _deleteModal.show();
}

async function _confirmDelete() {
  const btn = $('deleteBudgetConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('budgets.deleting')}`;

  try {
    await BudgetService.deleteBudget(_s.actionId);
    _deleteModal.hide();
    showSuccess(t('budgets.deleted_success'));
    await _reloadAfterChange();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('budgets.error')) : t('budgets.error'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('budgets.delete_confirm_btn');
  }
}

/* --------------------------------------------------------------------------
   Reload after mutation
   -------------------------------------------------------------------------- */
async function _reloadAfterChange() {
  try {
    const dashboard = await BudgetService.getDashboard();
    _s.dashboard  = dashboard;
    _s.allBudgets = dashboard?.budgets ?? [];

    const hasAny = _s.allBudgets.length > 0;

    if (!hasAny) {
      _hide($('budgetsContent'));
      _show($('budgetsNoData'));
      return;
    }

    _hide($('budgetsNoData'));
    _show($('budgetsContent'));

    if (dashboard?.summary) _renderKpis(dashboard.summary);

    _applyFilters();
    _renderGrid();
    _renderBarChart(dashboard?.trend ?? []);
    _renderDonutChart(_s.allBudgets);
  } catch { /* non-critical */ }
}

/* --------------------------------------------------------------------------
   Event delegation on grid
   -------------------------------------------------------------------------- */
function _bindGridEvents() {
  const grid = $('budgetsGrid');
  grid.addEventListener('click', e => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const id = Number(btn.dataset.id);

    if (btn.classList.contains('budget-action-edit'))
      _openEdit(id);
    else if (btn.classList.contains('budget-action-pause-resume'))
      _togglePauseResume(id, Number(btn.dataset.status));
    else if (btn.classList.contains('budget-action-delete'))
      _openDelete(id);
  });
}

/* --------------------------------------------------------------------------
   Wire all events
   -------------------------------------------------------------------------- */
function _wireEvents() {
  /* Budget type selection in wizard */
  document.querySelectorAll('#bwTypeGrid .budget-type-option').forEach(card => {
    const select = () => {
      document.querySelectorAll('#bwTypeGrid .budget-type-option')
        .forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      _s.wType = Number(card.dataset.type);
      $('bwNextBtn').disabled = false;
    };
    card.addEventListener('click', select);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
  });

  /* Wizard navigation */
  $('bwNextBtn').addEventListener('click', () => {
    if (_s.wStep < 3) _wizSetStep(_s.wStep + 1);
  });
  $('bwBackBtn').addEventListener('click', () => {
    if (_s.wStep > 1) _wizSetStep(_s.wStep - 1);
  });
  $('bwCreateBtn').addEventListener('click', _submitWizard);

  /* Wizard inline validation */
  $('bwName').addEventListener('input', () => {
    if (_s.wStep === 2) $('bwNextBtn').disabled = !$('bwName').value.trim();
  });
  $('bwAmount').addEventListener('input', () => {
    if (_s.wStep === 3) $('bwCreateBtn').disabled = !($('bwAmount').value > 0);
  });

  /* Add budget buttons */
  $('addBudgetBtn')?.addEventListener('click', _openWizard);
  $('addBudgetBtnEmpty')?.addEventListener('click', _openWizard);

  /* Edit + Delete submit */
  $('editBudgetSaveBtn')?.addEventListener('click', _submitEdit);
  $('deleteBudgetConfirmBtn')?.addEventListener('click', _confirmDelete);

  /* Filters */
  $('filterStatus')?.addEventListener('change', () => {
    _s.filterStatus = $('filterStatus').value ? Number($('filterStatus').value) : null;
    _applyFilters();
    _renderGrid();
  });

  let _searchTimer = null;
  $('filterSearch')?.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      _s.filterSearch = $('filterSearch').value.trim();
      _applyFilters();
      _renderGrid();
    }, 280);
  });

  /* Grid event delegation */
  _bindGridEvents();

  /* Theme change — rebuild charts */
  document.addEventListener('mm-theme-change', () => {
    if (!_s.dashboard) return;
    _renderBarChart(_s.dashboard.trend ?? []);
    _renderDonutChart(_s.allBudgets);
  });

  document.addEventListener('mm-currency-change', () => {
    if (!_s.dashboard) return;
    if (_s.dashboard.summary) _renderKpis(_s.dashboard.summary);
    _applyFilters();
    _renderGrid();
  });
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();

  _wizardModal = new bootstrap.Modal($('budgetWizardModal'));
  _editModal   = new bootstrap.Modal($('editBudgetModal'));
  _deleteModal = new bootstrap.Modal($('deleteBudgetModal'));

  // Load categories for dropdowns in parallel with page data
  await _loadCategories();
  _populateCategorySelects();

  _wireEvents();
  await loadPage();
}

init();
