/**
 * pages/dashboard.js — MyMoney
 * Dashboard page: KPI cards, trend chart, category breakdown, recent transactions.
 */

import { initI18n, t, getLanguage }     from '../core/i18n.js';
import { initLayout }                    from '../components/layout.js';
import { guardPage }                     from '../core/auth.js';
import { initOnboarding }                from '../components/onboarding.js';
import { DashboardService }              from '../services/dashboard-service.js';
import { FinancialIntelligenceService }  from '../services/financial-intelligence-service.js';
import { CashFlowService }               from '../services/cash-flow-service.js';
import { ApiError }                      from '../core/api.js';
import { showError }                     from '../components/toast.js';
import { formatAmount }                  from '../core/currency.js';
import {
  incomeColors, expenseColors, chartPalette,
  chartTooltipOptions, chartLegendLabels, chartScales, chartSurfaceColor,
} from '../core/chart-theme.js';

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const kpiSkeletons      = document.getElementById('kpiSkeletons');
const kpiCards          = document.getElementById('kpiCards');
const chartsSkeletons   = document.getElementById('chartsSkeletons');
const chartsRow         = document.getElementById('chartsRow');
const bottomSkeletons   = document.getElementById('bottomSkeletons');
const bottomRow         = document.getElementById('bottomRow');
const emptyState        = document.getElementById('emptyState');

const kpiIncomeVal      = document.getElementById('kpiIncomeVal');
const kpiIncomeChange   = document.getElementById('kpiIncomeChange');
const kpiExpensesVal    = document.getElementById('kpiExpensesVal');
const kpiExpensesChange = document.getElementById('kpiExpensesChange');
const kpiNetVal         = document.getElementById('kpiNetVal');
const kpiNetChange      = document.getElementById('kpiNetChange');
const kpiCountVal       = document.getElementById('kpiCountVal');
const kpiCountChange    = document.getElementById('kpiCountChange');

const filSkeletons      = document.getElementById('filSkeletons');
const filStrip          = document.getElementById('filStrip');
const cfStripSkeletons  = document.getElementById('cfStripSkeletons');
const cfStrip           = document.getElementById('cfStrip');

const breakdownEmpty    = document.getElementById('breakdownEmpty');
const breakdownChart    = document.getElementById('breakdownChart');
const donutLegend       = document.getElementById('donutLegend');

const recentEmpty       = document.getElementById('recentEmpty');
const recentTableWrap   = document.getElementById('recentTableWrap');
const recentTbody       = document.getElementById('recentTbody');

/* --------------------------------------------------------------------------
   Chart instances (destroyed before re-render)
   -------------------------------------------------------------------------- */
let _trendChartInstance = null;
let _donutChartInstance = null;

/* --------------------------------------------------------------------------
   Last-loaded data — kept so charts can be rebuilt on theme change
   without a new network request.
   -------------------------------------------------------------------------- */
let _lastData = null;

/* --------------------------------------------------------------------------
   Formatting helpers
   -------------------------------------------------------------------------- */
const _lang = () => getLanguage();

function _fmtInt(value) {
  return new Intl.NumberFormat(_lang() === 'ar' ? 'ar-EG' : 'en-US').format(value);
}

function _fmtDate(isoDate) {
  if (!isoDate) return '—';
  try {
    const locale = _lang() === 'ar' ? 'ar-EG' : 'en-US';
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
      .format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

function _monthLabel(year, month) {
  const key = `dashboard.month_${month}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return new Date(year, month - 1, 1)
    .toLocaleString(_lang() === 'ar' ? 'ar-EG' : 'en-US', { month: 'short' });
}

function _esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _buildMonthSlots(year, month, count) {
  const slots = [];
  for (let i = count - 1; i >= 0; i--) {
    let m = month - i;
    let y = year;
    while (m <= 0) { m += 12; y -= 1; }
    slots.push({ year: y, month: m, income: 0, expenses: 0 });
  }
  return slots;
}

/* --------------------------------------------------------------------------
   Change chip renderers
   -------------------------------------------------------------------------- */
function _changePill(changePercent, isPositiveGood = true) {
  if (changePercent === null || changePercent === undefined) {
    return `<span class="text-muted small">${t('dashboard.no_change')}</span>`;
  }
  const isPositive = changePercent >= 0;
  const isGood     = isPositiveGood ? isPositive : !isPositive;
  const cls        = isGood ? 'text-success' : 'text-danger';
  const icon       = isPositive ? 'bi-arrow-up-right' : 'bi-arrow-down-right';
  const sign       = isPositive ? '+' : '';
  const val        = Math.abs(changePercent).toFixed(1);
  return `<span class="${cls} small"><i class="bi ${icon}"></i> ${sign}${val}% <span class="text-muted fw-normal">${t('dashboard.vs_last_month')}</span></span>`;
}

function _countChangePill(change) {
  if (change === null || change === undefined)
    return `<span class="text-muted small">—</span>`;
  if (change === 0)
    return `<span class="text-muted small">${t('dashboard.no_change')}</span>`;
  const isPositive = change > 0;
  const cls  = isPositive ? 'text-success' : 'text-danger';
  const icon = isPositive ? 'bi-arrow-up-right' : 'bi-arrow-down-right';
  return `<span class="${cls} small"><i class="bi ${icon}"></i> ${isPositive ? '+' : ''}${_fmtInt(change)} <span class="text-muted fw-normal">${t('dashboard.vs_last_month')}</span></span>`;
}

/* --------------------------------------------------------------------------
   KPI rendering
   -------------------------------------------------------------------------- */
function _renderKpi(kpi) {
  kpiIncomeVal.textContent   = formatAmount(kpi.currentIncome);
  kpiExpensesVal.textContent = formatAmount(kpi.currentExpenses);

  const net = kpi.currentNet;
  kpiNetVal.textContent    = (net < 0 ? '−' : '') + formatAmount(Math.abs(net));
  kpiNetVal.style.color    = net < 0 ? '#dc3545' : net > 0 ? '#198754' : '';
  kpiCountVal.textContent  = _fmtInt(kpi.currentTransactionCount);

  kpiIncomeChange.innerHTML    = _changePill(kpi.incomeChangePercent, true);
  kpiExpensesChange.innerHTML  = _changePill(kpi.expensesChangePercent, false);
  kpiNetChange.innerHTML       = _changePill(kpi.netChangePercent, true);
  kpiCountChange.innerHTML     = _countChangePill(kpi.transactionCountChange);
}

/* --------------------------------------------------------------------------
   6-Month trend bar chart
   -------------------------------------------------------------------------- */
function _renderTrendChart(trend) {
  if (_trendChartInstance) { _trendChartInstance.destroy(); _trendChartInstance = null; }

  const now    = new Date();
  const months = _buildMonthSlots(now.getFullYear(), now.getMonth() + 1, 6);

  for (const item of trend) {
    const slot = months.find(m => m.year === item.year && m.month === item.month);
    if (slot) { slot.income = item.income; slot.expenses = item.expenses; }
  }

  const labels   = months.map(m => _monthLabel(m.year, m.month));
  const incomes  = months.map(m => m.income);
  const expenses = months.map(m => m.expenses);

  const inc = incomeColors();
  const exp = expenseColors();

  const ctx = document.getElementById('trendChart').getContext('2d');
  _trendChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: t('dashboard.trend_income'),
          data: incomes,
          backgroundColor: inc.backgroundColor,
          borderColor: inc.borderColor,
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          label: t('dashboard.trend_expenses'),
          data: expenses,
          backgroundColor: exp.backgroundColor,
          borderColor: exp.borderColor,
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: chartLegendLabels(),
        },
        tooltip: {
          ...chartTooltipOptions(),
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${formatAmount(ctx.parsed.y)}`,
          },
        },
      },
      scales: chartScales({ yCallback: val => formatAmount(val) }),
    },
  });
}

/* --------------------------------------------------------------------------
   Category breakdown donut + legend
   -------------------------------------------------------------------------- */
function _renderBreakdown(breakdown) {
  if (!breakdown || breakdown.length === 0) {
    breakdownEmpty.classList.remove('d-none');
    breakdownChart.classList.add('d-none');
    return;
  }

  breakdownEmpty.classList.add('d-none');
  breakdownChart.classList.remove('d-none');

  if (_donutChartInstance) { _donutChartInstance.destroy(); _donutChartInstance = null; }

  const isAr    = _lang() === 'ar';
  const labels  = breakdown.map(b => isAr && b.nameAr ? b.nameAr : b.nameEn);
  const amounts = breakdown.map(b => b.totalAmount);
  const palette = chartPalette();
  const colors  = palette.slice(0, breakdown.length);

  const ctx = document.getElementById('donutChart').getContext('2d');
  _donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: amounts,
        backgroundColor: colors,
        borderColor: chartSurfaceColor(),
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          ...chartTooltipOptions(),
          callbacks: {
            label: ctx => ` ${formatAmount(ctx.parsed)} (${breakdown[ctx.dataIndex]?.percentage ?? 0}%)`,
          },
        },
      },
    },
  });

  donutLegend.innerHTML = breakdown.map((b, i) => {
    const name = isAr && b.nameAr ? b.nameAr : b.nameEn;
    return `<div class="donut-legend-item">
      <span class="donut-legend-dot" style="background:${colors[i] ?? '#ccc'}"></span>
      <span class="text-truncate">${_esc(name)}</span>
      <span class="donut-legend-pct text-muted">${b.percentage}%</span>
    </div>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   Recent transactions table
   -------------------------------------------------------------------------- */
function _renderRecentTransactions(transactions) {
  if (!transactions || transactions.length === 0) {
    recentEmpty.classList.remove('d-none');
    recentTableWrap.classList.add('d-none');
    return;
  }

  recentEmpty.classList.add('d-none');
  recentTableWrap.classList.remove('d-none');

  const isAr = _lang() === 'ar';

  recentTbody.innerHTML = transactions.map(tx => {
    const isIncome = tx.transactionTypeId === 1;
    const amtCls   = isIncome ? 'tx-badge-income' : 'tx-badge-expense';
    const amtSign  = isIncome ? '+' : '−';
    const catName  = isAr && tx.categoryNameAr ? tx.categoryNameAr : tx.categoryNameEn;
    const desc     = tx.description
      ? _esc(tx.description)
      : `<span class="text-muted">—</span>`;

    return `<tr>
      <td class="text-nowrap text-muted">${_fmtDate(tx.transactionDate)}</td>
      <td>${_esc(catName)}</td>
      <td>${desc}</td>
      <td class="text-end text-nowrap">
        <span class="tx-amount ${amtCls}">${amtSign}${formatAmount(tx.amount)}</span>
      </td>
    </tr>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   FIL helpers
   -------------------------------------------------------------------------- */
function _computeHealthScore(snapshot, insights = []) {
  if (!snapshot || snapshot.totalIncome <= 0) return null;
  const expenseRatio = snapshot.totalExpense / snapshot.totalIncome;
  const savingsRate  = snapshot.netBalance   / snapshot.totalIncome;

  const s = savingsRate >= 0.30 ? 40
          : savingsRate >= 0.20 ? 32
          : savingsRate >= 0.10 ? 22
          : savingsRate >= 0.05 ? 14
          : savingsRate >= 0    ? 8 : 0;

  const e = expenseRatio <= 0.50 ? 40
          : expenseRatio <= 0.60 ? 35
          : expenseRatio <= 0.70 ? 28
          : expenseRatio <= 0.80 ? 20
          : expenseRatio <= 0.90 ? 12
          : expenseRatio <= 1.00 ? 5 : 0;

  const cnt = snapshot.transactionCount || 0;
  const a   = cnt >= 10 ? 20 : cnt >= 5 ? 15 : cnt >= 2 ? 10 : cnt >= 1 ? 5 : 0;

  const critical = insights.filter(i => i.severity === 4).length;
  const high     = insights.filter(i => i.severity === 3).length;
  const penalty  = Math.min(critical * 5 + high * 2, 20);

  return Math.max(0, Math.min(100, s + e + a - penalty));
}

function _scoreLevelCls(score) {
  return score >= 90 ? 'fil-score-excellent'
       : score >= 75 ? 'fil-score-great'
       : score >= 60 ? 'fil-score-good'
       : score >= 40 ? 'fil-score-fair'
       : 'fil-score-at-risk';
}

function _sevCls(severity) {
  return ['', 'fil-sev-low', 'fil-sev-medium', 'fil-sev-high', 'fil-sev-critical'][severity] || 'fil-sev-info';
}

function _sevIcon(severity) {
  return [, 'bi-info-circle', 'bi-exclamation-circle', 'bi-exclamation-triangle-fill', 'bi-x-octagon-fill'][severity] || 'bi-info-circle';
}

function _recIcon(type) {
  return [, 'bi-graph-down-arrow', 'bi-piggy-bank', 'bi-folder2-open', 'bi-pie-chart', 'bi-cash-stack'][type] || 'bi-lightbulb';
}

function _priCls(priority) {
  return priority >= 3 ? 'fil-pri-high' : priority >= 2 ? 'fil-pri-medium' : 'fil-pri-low';
}

function _timeAgo(isoUtc) {
  if (!isoUtc) return '';
  const ms   = Date.now() - new Date(isoUtc).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1)   return t('notifications.just_now');
  if (mins < 60)  return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function _renderFilStrip(data) {
  if (!data) return;

  const { latestSnapshot, topInsights = [], recommendations = [] } = data;
  const score    = _computeHealthScore(latestSnapshot, topInsights);
  const levelCls = score !== null ? _scoreLevelCls(score) : null;
  const isAr     = _lang() === 'ar';

  /* ── Health Score section ── */
  const scoreHtml = score !== null ? `
    <div class="d-flex align-items-center gap-3">
      <div class="fil-score-ring ${levelCls}" style="--score:${score}">
        <span class="fil-score-num">${score}</span>
      </div>
      <div>
        <div class="fil-score-level ${levelCls} mb-1">${t(`fil.score_${levelCls.replace('fil-score-', '').replace(/-/g, '_')}`)}</div>
        <p class="text-muted mb-0" style="font-size:0.78rem;line-height:1.4;">${t('fil.subheading').split('.')[0]}.</p>
      </div>
    </div>` : `
    <div class="fil-empty" style="padding:0.75rem 0;">
      <i class="bi bi-hourglass-split text-muted fs-4"></i>
      <p class="text-muted small mb-0">${t('fil.no_data_desc')}</p>
    </div>`;

  /* ── Top Insight section ── */
  const topInsight = topInsights.find(i => !i.isRead) || topInsights[0];
  const insightHtml = topInsight ? `
    <div class="d-flex align-items-start gap-2">
      <div class="fil-sev-icon ${_sevCls(topInsight.severity)} flex-shrink-0">
        <i class="bi ${_sevIcon(topInsight.severity)}"></i>
      </div>
      <div style="min-width:0;">
        <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
          <span class="fil-sev-badge ${_sevCls(topInsight.severity)}">${t(`fil.sev_${_sevCls(topInsight.severity).replace('fil-sev-', '')}`)}</span>
          <span class="text-muted" style="font-size:0.68rem;">${_timeAgo(topInsight.generatedAtUtc)}</span>
        </div>
        <p class="fw-semibold mb-1 text-truncate" style="font-size:0.875rem;" title="${_esc(topInsight.title)}">${_esc(topInsight.title)}</p>
        <p class="text-muted mb-0" style="font-size:0.78rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${_esc(topInsight.description)}</p>
      </div>
    </div>` : `
    <div class="fil-empty" style="padding:0.5rem 0;">
      <i class="bi bi-check-circle text-success fs-5"></i>
      <p class="text-muted small mb-0">${t('fil.insights_empty_title')}</p>
    </div>`;

  /* ── Top Recommendation section ── */
  const topRec = recommendations.find(r => !r.isApplied && !r.isDismissed);
  const recHtml = topRec ? `
    <div class="d-flex align-items-start gap-2">
      <div class="fil-rec-icon flex-shrink-0">
        <i class="bi ${_recIcon(topRec.type)}"></i>
      </div>
      <div style="min-width:0;">
        <div class="mb-1">
          <span class="fil-pri-badge ${_priCls(topRec.priority)}">${t(`fil.pri_${_priCls(topRec.priority).replace('fil-pri-', '')}`)}</span>
        </div>
        <p class="fw-semibold mb-1 text-truncate" style="font-size:0.875rem;" title="${_esc(topRec.title)}">${_esc(topRec.title)}</p>
        <p class="text-muted mb-0" style="font-size:0.78rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${_esc(topRec.message)}</p>
      </div>
    </div>` : `
    <div class="fil-empty" style="padding:0.5rem 0;">
      <i class="bi bi-check2-all text-success fs-5"></i>
      <p class="text-muted small mb-0">${t('fil.recommendations_empty_title')}</p>
    </div>`;

  filStrip.innerHTML = `
    <div class="panel p-0 overflow-hidden">
      <div class="fil-strip">
        <div class="fil-strip-section">
          <p class="fil-strip-label"><i class="bi bi-heart-pulse me-1" aria-hidden="true"></i>${t('fil.strip_score_label')}</p>
          ${scoreHtml}
        </div>
        <div class="fil-strip-section">
          <p class="fil-strip-label"><i class="bi bi-lightbulb me-1" aria-hidden="true"></i>${t('fil.strip_insight_label')}</p>
          ${insightHtml}
        </div>
        <div class="fil-strip-section">
          <p class="fil-strip-label"><i class="bi bi-stars me-1" aria-hidden="true"></i>${t('fil.strip_rec_label')}</p>
          ${recHtml}
        </div>
      </div>
      <div class="fil-strip-footer">
        <a href="/pages/financial-intelligence/index.html" class="btn btn-sm btn-outline-secondary" style="font-size:0.78rem;padding:0.2rem 0.7rem;">
          ${t('fil.view_intelligence')} <i class="bi bi-arrow-${isAr ? 'left' : 'right'}-short" aria-hidden="true"></i>
        </a>
      </div>
    </div>`;
  filStrip.classList.remove('d-none');
}

/* --------------------------------------------------------------------------
   Cash Flow forecast strip (dashboard widget)
   -------------------------------------------------------------------------- */
function _confBandCls(band) {
  return band === 3 ? 'cf-conf-high' : band === 2 ? 'cf-conf-medium' : 'cf-conf-low';
}
function _confBandKey(band) {
  return band === 3 ? 'high' : band === 2 ? 'medium' : 'low';
}

function _renderCfStrip(data) {
  if (!cfStrip || !data) return;

  const isAr        = _lang() === 'ar';
  const endBalance  = data.forecastedEndBalance ?? 0;
  const netFlow     = (data.recurringIncomeMonthly ?? 0) - (data.recurringExpenseMonthly ?? 0);
  const band        = data.confidenceBand ?? 1;
  const topRisks    = (data.topRisks ?? []).slice(0, 2);
  const hasRisks    = topRisks.length > 0;
  const maxSev      = hasRisks ? Math.max(...topRisks.map(r => r.severity ?? 1)) : 0;
  const riskColor   = maxSev >= 3 ? 'var(--mm-danger)' : maxSev >= 2 ? 'var(--mm-warning)' : 'var(--mm-info)';

  const balanceHtml = `
    <div class="d-flex align-items-center gap-3">
      <div class="kpi-icon" style="background:rgba(37,99,235,.1);color:var(--mm-primary);flex-shrink:0;">
        <i class="bi bi-graph-up-arrow" aria-hidden="true"></i>
      </div>
      <div>
        <p class="text-muted mb-1" style="font-size:0.72rem;text-transform:uppercase;letter-spacing:.04em;">${t('cash_flow.kpi_projected_balance')}</p>
        <div class="fw-bold" style="font-size:1.05rem;color:${endBalance < 0 ? 'var(--mm-danger)' : 'var(--mm-success)'};">${formatAmount(endBalance)}</div>
        <span class="cf-conf-badge ${_confBandCls(band)}" style="margin-top:.25rem;display:inline-flex;">
          ${t(`cash_flow.confidence_${_confBandKey(band)}`)}
        </span>
      </div>
    </div>`;

  const netHtml = `
    <div class="d-flex align-items-center gap-3">
      <div class="kpi-icon" style="background:${netFlow >= 0 ? 'rgba(15,118,110,.1)' : 'rgba(220,38,38,.1)'};color:${netFlow >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)'};flex-shrink:0;">
        <i class="bi bi-arrow-left-right" aria-hidden="true"></i>
      </div>
      <div>
        <p class="text-muted mb-1" style="font-size:0.72rem;text-transform:uppercase;letter-spacing:.04em;">${t('cash_flow.kpi_monthly_net')}</p>
        <div class="fw-bold" style="font-size:1.05rem;color:${netFlow < 0 ? 'var(--mm-danger)' : 'var(--mm-success)'};">
          ${(netFlow < 0 ? '−' : '+') + formatAmount(Math.abs(netFlow))}
        </div>
      </div>
    </div>`;

  const risksHtml = hasRisks ? `
    <div>
      <p class="text-muted mb-2" style="font-size:0.72rem;text-transform:uppercase;letter-spacing:.04em;">${t('cash_flow.risks_title')}</p>
      ${topRisks.map(r => `
        <div class="d-flex align-items-center gap-2 mb-1">
          <i class="bi bi-exclamation-circle" style="color:${riskColor};font-size:0.8rem;" aria-hidden="true"></i>
          <span style="font-size:0.78rem;color:var(--mm-text);">${_esc(r.title ?? t(`cash_flow.risk_type_${r.riskType}`))}</span>
        </div>`).join('')}
    </div>` : `
    <div class="d-flex align-items-center gap-2">
      <i class="bi bi-shield-check text-success fs-5" aria-hidden="true"></i>
      <span class="text-muted small">${t('cash_flow.risks_empty')}</span>
    </div>`;

  cfStrip.innerHTML = `
    <div class="panel p-0 overflow-hidden">
      <div class="fil-strip">
        <div class="fil-strip-section">${balanceHtml}</div>
        <div class="fil-strip-section">${netHtml}</div>
        <div class="fil-strip-section">${risksHtml}</div>
      </div>
      <div class="fil-strip-footer">
        <a href="/pages/cash-flow/index.html" class="btn btn-sm btn-outline-secondary" style="font-size:0.78rem;padding:.2rem .7rem;">
          ${t('cash_flow.nav_label')} <i class="bi bi-arrow-${isAr ? 'left' : 'right'}-short" aria-hidden="true"></i>
        </a>
      </div>
    </div>`;

  cfStrip.classList.remove('d-none');
}

/* --------------------------------------------------------------------------
   Skeleton state helpers
   -------------------------------------------------------------------------- */
function _showSkeletons() {
  kpiSkeletons.classList.remove('d-none');       kpiCards.classList.add('d-none');
  chartsSkeletons.classList.remove('d-none');    chartsRow.classList.add('d-none');
  bottomSkeletons.classList.remove('d-none');    bottomRow.classList.add('d-none');
  filSkeletons.classList.remove('d-none');       filStrip.classList.add('d-none');
  cfStripSkeletons?.classList.remove('d-none');  cfStrip?.classList.add('d-none');
  emptyState.classList.add('d-none');
}

function _hideSkeletons() {
  kpiSkeletons.classList.add('d-none');
  chartsSkeletons.classList.add('d-none');
  bottomSkeletons.classList.add('d-none');
  filSkeletons.classList.add('d-none');
  cfStripSkeletons?.classList.add('d-none');
}

/* --------------------------------------------------------------------------
   Load dashboard
   -------------------------------------------------------------------------- */
async function loadDashboard() {
  _showSkeletons();

  const [dashResult, filResult, cfResult] = await Promise.allSettled([
    DashboardService.getSummary(),
    FinancialIntelligenceService.getDashboard(),
    CashFlowService.getDashboard(),
  ]);

  _hideSkeletons();

  if (filResult.status === 'fulfilled' && filResult.value) {
    _renderFilStrip(filResult.value);
  }

  if (cfResult.status === 'fulfilled' && cfResult.value?.forecastId) {
    _renderCfStrip(cfResult.value);
    if (_lastData) _lastData.cfData = cfResult.value;
  }

  if (dashResult.status === 'rejected') {
    const err = dashResult.reason;
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
    return;
  }

  const data = dashResult.value;

  const { kpi, monthlyTrend, categoryBreakdown, recentTransactions } = data;

  // If user has never recorded a transaction, show full empty state
  if (!recentTransactions || recentTransactions.length === 0) {
    emptyState.classList.remove('d-none');
    return;
  }

  // Cache for theme-change rebuilds
  _lastData = data;

  kpiCards.classList.remove('d-none');
  _renderKpi(kpi);

  chartsRow.classList.remove('d-none');
  _renderTrendChart(monthlyTrend);

  bottomRow.classList.remove('d-none');
  _renderBreakdown(categoryBreakdown);
  _renderRecentTransactions(recentTransactions);
}

/* --------------------------------------------------------------------------
   Theme change — rebuild charts with correct colours without a network call
   -------------------------------------------------------------------------- */
document.addEventListener('mm-theme-change', () => {
  if (!_lastData) return;
  _renderTrendChart(_lastData.monthlyTrend);
  _renderBreakdown(_lastData.categoryBreakdown);
});

/* --------------------------------------------------------------------------
   Currency change — re-fetch so amounts are converted by the backend, not just
   re-labelled with the new currency (re-rendering cached data would show the
   previous currency's numbers under the new currency symbol).
   -------------------------------------------------------------------------- */
document.addEventListener('mm-currency-change', () => {
  loadDashboard();
});

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  await loadDashboard();
  initOnboarding();
}

init();
