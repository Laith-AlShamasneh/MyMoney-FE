/**
 * pages/cash-flow.js — MyMoney
 * Cash Flow Forecasting: KPI cards, timeline chart, monthly breakdown,
 * risk analysis, goal projections, recurring summary, what-if simulation.
 */

import { initI18n, t, getLanguage }  from '../core/i18n.js';
import { initLayout }                 from '../components/layout.js';
import { guardPage }                  from '../core/auth.js';
import { CashFlowService }            from '../services/cash-flow-service.js';
import { ApiError }                   from '../core/api.js';
import { showError }                  from '../components/toast.js';
import { formatAmount }               from '../core/currency.js';
import {
  incomeColors, expenseColors,
  chartTooltipOptions, chartLegendLabels, chartScales, chartTextColor,
} from '../core/chart-theme.js';

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const cfSkeleton   = document.getElementById('cfSkeleton');
const cfNoData     = document.getElementById('cfNoData');
const cfContent    = document.getElementById('cfContent');
const cfMeta       = document.getElementById('cfMeta');

const cfKpiBalance     = document.getElementById('cfKpiBalance');
const cfKpiBalanceHint = document.getElementById('cfKpiBalanceHint');
const cfKpiNet         = document.getElementById('cfKpiNet');
const cfKpiNetHint     = document.getElementById('cfKpiNetHint');
const cfKpiConf        = document.getElementById('cfKpiConf');
const cfKpiConfBadge   = document.getElementById('cfKpiConfBadge');
const cfKpiRisks       = document.getElementById('cfKpiRisks');
const cfKpiRiskLevel   = document.getElementById('cfKpiRiskLevel');
const cfKpiGoals       = document.getElementById('cfKpiGoals');
const cfKpiGoalsHint   = document.getElementById('cfKpiGoalsHint');

const cfMonthTbody   = document.getElementById('cfMonthTbody');
const cfRisksEmpty   = document.getElementById('cfRisksEmpty');
const cfRisksList    = document.getElementById('cfRisksList');
const cfGoalsEmpty   = document.getElementById('cfGoalsEmpty');
const cfGoalsGrid    = document.getElementById('cfGoalsGrid');
const cfGoalsArrow   = document.getElementById('cfGoalsArrow');
const cfRecurringStrip = document.getElementById('cfRecurringStrip');
const simIncomeVal   = document.getElementById('simIncomeVal');
const simExpenseVal  = document.getElementById('simExpenseVal');
const cfSimResult    = document.getElementById('cfSimResult');
const cfSimReset     = document.getElementById('cfSimReset');

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
let _forecast       = null;   // CashFlowForecastResponse
let _visibleMonths  = 12;     // current horizon selection
let _simIncomeAdj   = 0;      // % adjustment (-50 to +100, step 10)
let _simExpenseAdj  = 0;
let _timelineChart  = null;

/* --------------------------------------------------------------------------
   Formatting helpers
   -------------------------------------------------------------------------- */
const _lang = () => getLanguage();

function _fmtAmount(value) {
  return formatAmount(value ?? 0);
}

function _fmtPct(value) {
  return new Intl.NumberFormat(_lang() === 'ar' ? 'ar-EG' : 'en-US', {
    minimumFractionDigits: 0, maximumFractionDigits: 1,
  }).format(value ?? 0) + '%';
}

function _esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _fmtMonthYear(monthYearStr) {
  if (!monthYearStr) return '—';
  try {
    const d = new Date(monthYearStr);
    return new Intl.DateTimeFormat(_lang() === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'short', year: 'numeric',
    }).format(d);
  } catch { return monthYearStr; }
}

function _fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat(_lang() === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'short', year: 'numeric',
    }).format(d);
  } catch { return dateStr; }
}

function _fmtRelativeDate(dateStr) {
  if (!dateStr) return t('cash_flow.goal_no_completion');
  try {
    const target = new Date(dateStr);
    const now    = new Date();
    const diffMs = target - now;
    const days   = Math.ceil(diffMs / 86400000);
    if (days < 0) return _fmtDate(dateStr);
    if (days < 365) return _fmtDate(dateStr);
    return _fmtDate(dateStr);
  } catch { return dateStr; }
}

/* --------------------------------------------------------------------------
   Domain helpers
   -------------------------------------------------------------------------- */
function _confBandKey(band) {
  return band === 3 ? 'high' : band === 2 ? 'medium' : 'low';
}

function _confBandCls(band) {
  return band === 3 ? 'cf-conf-high' : band === 2 ? 'cf-conf-medium' : 'cf-conf-low';
}

function _sevIcon(sev) {
  return [, 'bi-info-circle', 'bi-exclamation-circle', 'bi-exclamation-triangle-fill', 'bi-x-octagon-fill'][sev] || 'bi-exclamation-circle';
}

function _sevLabel(sev) {
  return t(`cash_flow.sev_${sev}`);
}

function _riskTypeLabel(riskType) {
  return t(`cash_flow.risk_type_${riskType}`);
}

function _maxSeverity(risks = []) {
  if (!risks.length) return 0;
  return Math.max(...risks.map(r => r.severity));
}

function _riskLevelLabel(maxSev) {
  if (maxSev === 0) return t('cash_flow.risk_none');
  if (maxSev === 1) return t('cash_flow.risk_low');
  if (maxSev === 2) return t('cash_flow.risk_medium');
  if (maxSev === 3) return t('cash_flow.risk_high');
  return t('cash_flow.risk_critical');
}

function _riskLevelColor(maxSev) {
  if (maxSev === 0) return 'var(--mm-success)';
  if (maxSev === 1) return 'var(--mm-info)';
  if (maxSev === 2) return 'var(--mm-warning)';
  return 'var(--mm-danger)';
}

/* --------------------------------------------------------------------------
   KPI rendering
   -------------------------------------------------------------------------- */
function _renderKpis(forecast) {
  const isAr    = _lang() === 'ar';
  const netFlow = (forecast.recurringIncomeMonthly ?? 0) - (forecast.recurringExpenseMonthly ?? 0);
  const maxSev  = _maxSeverity(forecast.risks);

  /* Projected balance */
  const endBalance = forecast.forecastedEndBalance ?? 0;
  cfKpiBalance.textContent = _fmtAmount(endBalance);
  cfKpiBalance.style.color = endBalance < 0 ? 'var(--mm-danger)' : endBalance > 0 ? 'var(--mm-success)' : '';
  cfKpiBalanceHint.textContent = t('cash_flow.horizon_12m');

  /* Monthly net */
  cfKpiNet.textContent = (netFlow < 0 ? '−' : '+') + _fmtAmount(Math.abs(netFlow));
  cfKpiNet.style.color = netFlow < 0 ? 'var(--mm-danger)' : 'var(--mm-success)';
  cfKpiNetHint.innerHTML = `<span class="text-muted" style="font-size:0.72rem;">${t('cash_flow.recurring_monthly_income').split(' ')[0]}</span>`;

  /* Confidence */
  const confPct    = Math.round(forecast.overallConfidence ?? 0);
  const band       = forecast.confidenceBand ?? 1;
  const bandKey    = _confBandKey(band);
  cfKpiConf.textContent = _fmtPct(confPct);
  cfKpiConfBadge.innerHTML = `<span class="cf-conf-badge ${_confBandCls(band)}">${t(`cash_flow.confidence_${bandKey}`)}</span>`;

  /* Risks */
  const riskCount = (forecast.risks ?? []).length;
  cfKpiRisks.textContent = new Intl.NumberFormat(_lang() === 'ar' ? 'ar-EG' : 'en-US').format(riskCount);
  cfKpiRisks.style.color = maxSev >= 3 ? 'var(--mm-danger)' : maxSev >= 2 ? 'var(--mm-warning)' : maxSev >= 1 ? 'var(--mm-info)' : 'var(--mm-success)';
  cfKpiRiskLevel.innerHTML = `<span style="color:${_riskLevelColor(maxSev)};font-size:0.78rem;font-weight:600;">${_riskLevelLabel(maxSev)}</span>`;

  /* Goal outlook */
  const goals       = forecast.goalProjections ?? [];
  const atRisk      = goals.filter(g => g.isAtRisk).length;
  const onTrack     = goals.length - atRisk;
  cfKpiGoals.textContent = goals.length > 0
    ? `${onTrack}/${goals.length}`
    : '—';
  cfKpiGoals.style.color = atRisk > 0 ? 'var(--mm-warning)' : goals.length > 0 ? 'var(--mm-success)' : '';
  cfKpiGoalsHint.innerHTML = goals.length > 0
    ? `<span style="font-size:0.72rem;color:${atRisk > 0 ? 'var(--mm-warning)' : 'var(--mm-success)'};">${atRisk > 0 ? atRisk + ' ' + t('cash_flow.goal_at_risk') : t('cash_flow.goal_on_track')}</span>`
    : '';
}

/* --------------------------------------------------------------------------
   Meta bar
   -------------------------------------------------------------------------- */
function _renderMeta(forecast) {
  const genAt = forecast.generatedAt
    ? new Date(forecast.generatedAt).toLocaleString(_lang() === 'ar' ? 'ar-EG' : 'en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const histMonths = forecast.monthsOfHistoryUsed ?? 0;
  const histLabel  = t('cash_flow.history_months').replace('{months}', histMonths);

  cfMeta.innerHTML = [
    genAt   ? `<i class="bi bi-clock" aria-hidden="true"></i><span>${t('cash_flow.generated_at')}: ${_esc(genAt)}</span>` : '',
    histMonths > 0 ? `<span class="ms-2"><i class="bi bi-calendar3 me-1" aria-hidden="true"></i>${_esc(histLabel)}</span>` : '',
  ].filter(Boolean).join('');
}

/* --------------------------------------------------------------------------
   Timeline chart
   -------------------------------------------------------------------------- */
function _buildChartData(months) {
  const labels   = months.map(m => _fmtMonthYear(m.monthYear));
  const balances = months.map(m => m.runningBalance ?? 0);
  const incomes  = months.map(m => m.projectedIncome ?? 0);
  const expenses = months.map(m => m.projectedExpense ?? 0);
  return { labels, balances, incomes, expenses };
}

function _renderChart(months) {
  if (_timelineChart) { _timelineChart.destroy(); _timelineChart = null; }

  const canvas = document.getElementById('cfTimelineChart');
  if (!canvas) return;

  const { labels, balances, incomes, expenses } = _buildChartData(months);
  const inc = incomeColors();
  const exp = expenseColors();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const balanceColor = isDark ? '#60a5fa' : '#2563eb';
  const balanceFill  = isDark ? 'rgba(96,165,250,0.1)' : 'rgba(37,99,235,0.08)';

  _timelineChart = new Chart(canvas.getContext('2d'), {
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: t('cash_flow.chart_balance'),
          data: balances,
          borderColor: balanceColor,
          backgroundColor: balanceFill,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: true,
          order: 0,
          yAxisID: 'y',
        },
        {
          type: 'bar',
          label: t('cash_flow.chart_income'),
          data: incomes,
          backgroundColor: inc.backgroundColor,
          borderColor: inc.borderColor,
          borderWidth: 1.5,
          borderRadius: 3,
          order: 1,
          yAxisID: 'y',
        },
        {
          type: 'bar',
          label: t('cash_flow.chart_expense'),
          data: expenses,
          backgroundColor: exp.backgroundColor,
          borderColor: exp.borderColor,
          borderWidth: 1.5,
          borderRadius: 3,
          order: 2,
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: chartLegendLabels(),
        },
        tooltip: {
          ...chartTooltipOptions(),
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${_fmtAmount(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        ...chartScales({ yCallback: val => _fmtAmount(val), showXGrid: false }),
      },
    },
  });
}

/* --------------------------------------------------------------------------
   Monthly breakdown table
   -------------------------------------------------------------------------- */
function _renderMonthlyTable(months) {
  const now     = new Date();
  const thisYM  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  cfMonthTbody.innerHTML = months.map(m => {
    const net       = (m.projectedNet ?? 0);
    const netCls    = net < 0 ? 'text-danger' : net > 0 ? 'text-success' : 'text-muted';
    const balCls    = (m.runningBalance ?? 0) < 0 ? 'text-danger' : '';
    const confPct   = Math.round(m.confidenceScore ?? 0);
    const isCurrent = m.monthYear && m.monthYear.startsWith(thisYM);

    return `<tr${isCurrent ? ' class="cf-current-month"' : ''}>
      <td class="text-nowrap">${_esc(_fmtMonthYear(m.monthYear))}</td>
      <td class="text-end text-success text-nowrap">${_fmtAmount(m.projectedIncome)}</td>
      <td class="text-end text-danger text-nowrap">${_fmtAmount(m.projectedExpense)}</td>
      <td class="text-end text-nowrap ${netCls}">${(net < 0 ? '−' : '+') + _fmtAmount(Math.abs(net))}</td>
      <td class="text-end text-nowrap ${balCls}">${_fmtAmount(m.runningBalance)}</td>
      <td class="text-end text-nowrap">
        <span class="cf-month-conf-bar">
          <span class="cf-month-conf-fill" style="width:${confPct}%;"></span>
        </span>
        <span class="text-muted ms-1" style="font-size:0.72rem;">${confPct}%</span>
      </td>
    </tr>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   Risk analysis
   -------------------------------------------------------------------------- */
function _renderRisks(risks = []) {
  if (!risks.length) {
    cfRisksEmpty.classList.remove('d-none');
    cfRisksList.classList.add('d-none');
    return;
  }

  cfRisksEmpty.classList.add('d-none');
  cfRisksList.classList.remove('d-none');

  // Sort: critical first
  const sorted = [...risks].sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));

  cfRisksList.innerHTML = sorted.map(risk => {
    const sev      = risk.severity ?? 1;
    const month    = risk.affectedMonth ? _fmtMonthYear(risk.affectedMonth) : null;

    return `<div class="cf-risk-item cf-risk-sev-${sev}">
      <div class="cf-risk-icon">
        <i class="bi ${_sevIcon(sev)}" aria-hidden="true"></i>
      </div>
      <div class="flex-grow-1 min-w-0">
        <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
          <span class="cf-risk-sev-badge">${_sevLabel(sev)}</span>
          <span class="fw-semibold" style="font-size:0.83rem;">${_esc(_riskTypeLabel(risk.riskType))}</span>
          ${month ? `<span class="text-muted ms-auto" style="font-size:0.72rem;">${_esc(month)}</span>` : ''}
        </div>
        <p class="text-muted mb-0" style="font-size:0.78rem;line-height:1.5;">${_esc(risk.description)}</p>
      </div>
    </div>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   Goal projections
   -------------------------------------------------------------------------- */
function _renderGoals(goals = []) {
  if (!goals.length) {
    cfGoalsEmpty.classList.remove('d-none');
    cfGoalsGrid.innerHTML = '';
    return;
  }

  cfGoalsEmpty.classList.add('d-none');

  cfGoalsGrid.innerHTML = goals.map(g => {
    const pct      = g.targetAmount > 0
      ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))
      : 0;
    const atRisk   = g.isAtRisk;
    const cardCls  = atRisk ? 'cf-goal-at-risk' : 'cf-goal-on-track';
    const statusCls = atRisk ? 'text-danger' : 'text-success';
    const statusLabel = atRisk ? t('cash_flow.goal_at_risk') : t('cash_flow.goal_on_track');
    const completion  = g.estimatedCompletionDate
      ? _fmtRelativeDate(g.estimatedCompletionDate)
      : t('cash_flow.goal_no_completion');

    return `<div class="col-md-6 col-xl-4">
      <div class="cf-goal-card ${cardCls}">
        <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
          <p class="fw-semibold mb-0" style="font-size:0.875rem;">${_esc(g.goalName)}</p>
          <span class="${statusCls}" style="font-size:0.72rem;font-weight:600;white-space:nowrap;">${statusLabel}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-muted" style="font-size:0.72rem;">${t('cash_flow.goal_saved')}: <strong>${_fmtAmount(g.currentAmount)}</strong></span>
          <span class="text-muted" style="font-size:0.72rem;">${t('cash_flow.goal_target')}: <strong>${_fmtAmount(g.targetAmount)}</strong></span>
        </div>
        <div class="cf-goal-progress-bar">
          <div class="cf-goal-progress-fill" style="width:${pct}%;"></div>
        </div>
        <div class="cf-goal-pace-row">
          <div class="cf-goal-pace-item">
            <span class="cf-goal-pace-label">${t('cash_flow.goal_monthly_needed')}</span>
            <span class="cf-goal-pace-val">${_fmtAmount(g.requiredMonthlyContribution)}</span>
          </div>
          <div class="cf-goal-pace-item">
            <span class="cf-goal-pace-label">${t('cash_flow.goal_monthly_pace')}</span>
            <span class="cf-goal-pace-val ${atRisk ? 'text-danger' : 'text-success'}">${_fmtAmount(g.avgMonthlyPace)}</span>
          </div>
          <div class="cf-goal-pace-item">
            <span class="cf-goal-pace-label">${t('cash_flow.goal_completion')}</span>
            <span class="cf-goal-pace-val">${_esc(completion)}</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   Recurring summary strip
   -------------------------------------------------------------------------- */
function _renderRecurring(forecast) {
  const recInc = forecast.recurringIncomeMonthly  ?? 0;
  const recExp = forecast.recurringExpenseMonthly ?? 0;

  cfRecurringStrip.innerHTML = `
    <div class="cf-recurring-item">
      <div class="text-muted mb-1" style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;" data-i18n="cash_flow.recurring_monthly_income">${t('cash_flow.recurring_monthly_income')}</div>
      <div class="text-success fw-semibold" style="font-size:1.05rem;">${_fmtAmount(recInc)}</div>
    </div>
    <div class="cf-recurring-item">
      <div class="text-muted mb-1" style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em;" data-i18n="cash_flow.recurring_monthly_expense">${t('cash_flow.recurring_monthly_expense')}</div>
      <div class="text-danger fw-semibold" style="font-size:1.05rem;">${_fmtAmount(recExp)}</div>
    </div>`;
}

/* --------------------------------------------------------------------------
   What-If simulation
   -------------------------------------------------------------------------- */
function _simAdjLabel(pct) {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

function _runSimulation() {
  if (!_forecast) return;

  const months   = (_forecast.monthlyTimeline ?? []).slice(0, _visibleMonths);
  const iAdj     = 1 + _simIncomeAdj / 100;
  const eAdj     = 1 + _simExpenseAdj / 100;
  const startBal = _forecast.currentBalanceEst ?? 0;

  let balance = startBal;
  for (const m of months) {
    balance += (m.projectedIncome ?? 0) * iAdj - (m.projectedExpense ?? 0) * eAdj;
  }

  const original = _forecast.forecastedEndBalance ?? 0;
  const diff     = balance - original;
  const diffSign = diff >= 0 ? '+' : '−';

  cfSimResult.innerHTML = `
    <div class="d-flex flex-wrap gap-3 align-items-center">
      <div>
        <span class="text-muted" style="font-size:0.72rem;">${t('cash_flow.sim_result_label')}</span>
        <div class="fw-bold" style="font-size:1rem;color:${balance < 0 ? 'var(--mm-danger)' : 'var(--mm-success)'};">${_fmtAmount(balance)}</div>
      </div>
      ${(_simIncomeAdj !== 0 || _simExpenseAdj !== 0) ? `
      <div>
        <span class="text-muted" style="font-size:0.72rem;">vs. ${t('cash_flow.kpi_projected_balance')}</span>
        <div class="fw-bold" style="font-size:0.9rem;color:${diff >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)'};">
          ${diffSign}${_fmtAmount(Math.abs(diff))}
        </div>
      </div>` : ''}
    </div>`;
}

function _updateSimDisplay() {
  simIncomeVal.textContent  = _simAdjLabel(_simIncomeAdj);
  simIncomeVal.style.color  = _simIncomeAdj > 0 ? 'var(--mm-success)' : _simIncomeAdj < 0 ? 'var(--mm-danger)' : '';
  simExpenseVal.textContent = _simAdjLabel(_simExpenseAdj);
  simExpenseVal.style.color = _simExpenseAdj > 0 ? 'var(--mm-danger)' : _simExpenseAdj < 0 ? 'var(--mm-success)' : '';
  _runSimulation();
}

/* --------------------------------------------------------------------------
   Horizon selection — rebuilds chart + table client-side
   -------------------------------------------------------------------------- */
function _applyHorizon(months) {
  if (!_forecast) return;
  _visibleMonths = months;
  const slice = (_forecast.monthlyTimeline ?? []).slice(0, months);
  _renderChart(slice);
  _renderMonthlyTable(slice);
  _runSimulation();
}

/* --------------------------------------------------------------------------
   Arrow direction (RTL-aware)
   -------------------------------------------------------------------------- */
function _updateArrow() {
  if (cfGoalsArrow) {
    cfGoalsArrow.className = _lang() === 'ar' ? 'bi bi-arrow-left-short' : 'bi bi-arrow-right-short';
  }
}

/* --------------------------------------------------------------------------
   Load forecast data
   -------------------------------------------------------------------------- */
async function loadPage() {
  cfSkeleton.classList.remove('d-none');

  let forecast = null;
  try {
    forecast = await CashFlowService.getForecast(12);
  } catch (err) {
    cfSkeleton.classList.add('d-none');
    if (err instanceof ApiError) {
      showError(err.message);
    } else {
      showError(t('errors.unknown'));
    }
    return;
  }

  cfSkeleton.classList.add('d-none');

  /* No forecast generated yet */
  const hasData = forecast &&
    forecast.forecastId &&
    (forecast.monthlyTimeline?.length ?? 0) > 0;

  if (!hasData) {
    cfNoData.classList.remove('d-none');
    return;
  }

  _forecast = forecast;
  cfContent.classList.remove('d-none');
  _updateArrow();

  _renderMeta(forecast);
  _renderKpis(forecast);

  const timeline = (forecast.monthlyTimeline ?? []).slice(0, _visibleMonths);
  _renderChart(timeline);
  _renderMonthlyTable(timeline);
  _renderRisks(forecast.risks ?? []);
  _renderGoals(forecast.goalProjections ?? []);
  _renderRecurring(forecast);
  _runSimulation();
}

/* --------------------------------------------------------------------------
   Event wiring
   -------------------------------------------------------------------------- */
function _wireEvents() {
  /* Horizon selector */
  document.querySelectorAll('.cf-horizon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cf-horizon-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _applyHorizon(parseInt(btn.dataset.horizon, 10));
    });
  });

  /* Simulation controls — income */
  document.querySelector('[data-sim-inc="income"]')?.addEventListener('click', () => {
    if (_simIncomeAdj < 100) { _simIncomeAdj += 10; _updateSimDisplay(); }
  });
  document.querySelector('[data-sim-dec="income"]')?.addEventListener('click', () => {
    if (_simIncomeAdj > -50) { _simIncomeAdj -= 10; _updateSimDisplay(); }
  });

  /* Simulation controls — expense */
  document.querySelector('[data-sim-inc="expense"]')?.addEventListener('click', () => {
    if (_simExpenseAdj < 100) { _simExpenseAdj += 10; _updateSimDisplay(); }
  });
  document.querySelector('[data-sim-dec="expense"]')?.addEventListener('click', () => {
    if (_simExpenseAdj > -50) { _simExpenseAdj -= 10; _updateSimDisplay(); }
  });

  /* Simulation reset */
  cfSimReset?.addEventListener('click', () => {
    _simIncomeAdj = 0;
    _simExpenseAdj = 0;
    _updateSimDisplay();
  });

  /* Theme change — rebuild chart */
  document.addEventListener('mm-theme-change', () => {
    if (!_forecast) return;
    const slice = (_forecast.monthlyTimeline ?? []).slice(0, _visibleMonths);
    _renderChart(slice);
  });
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  _wireEvents();
  await loadPage();
}

document.addEventListener('mm-currency-change', () => {
  if (!_forecast) return;
  _renderKpis(_forecast);
  const timeline = (_forecast.monthlyTimeline ?? []).slice(0, _visibleMonths);
  _renderMonthlyTable(timeline);
  _renderGoals(_forecast.goalProjections ?? []);
  _renderRecurring(_forecast);
});

init();
