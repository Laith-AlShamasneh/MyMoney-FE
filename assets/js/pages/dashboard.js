/**
 * pages/dashboard.js — MyMoney
 * Dashboard page: KPI cards, trend chart, category breakdown, recent transactions.
 */

import { initI18n, t, getLanguage }     from '../core/i18n.js';
import { initLayout }                    from '../components/layout.js';
import { guardPage }                     from '../core/auth.js';
import { DashboardService }              from '../services/dashboard-service.js';
import { ApiError }                      from '../core/api.js';
import { showError }                     from '../components/toast.js';
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

function _fmtAmount(value) {
  return new Intl.NumberFormat(_lang() === 'ar' ? 'ar-JO' : 'en-US', {
    style: 'currency', currency: 'JOD', minimumFractionDigits: 3,
  }).format(value);
}

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
  kpiIncomeVal.textContent   = _fmtAmount(kpi.currentIncome);
  kpiExpensesVal.textContent = _fmtAmount(kpi.currentExpenses);

  const net = kpi.currentNet;
  kpiNetVal.textContent    = (net < 0 ? '−' : '') + _fmtAmount(Math.abs(net));
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
            label: ctx => ` ${ctx.dataset.label}: ${_fmtAmount(ctx.parsed.y)}`,
          },
        },
      },
      scales: chartScales({ yCallback: val => _fmtAmount(val) }),
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
            label: ctx => ` ${_fmtAmount(ctx.parsed)} (${breakdown[ctx.dataIndex]?.percentage ?? 0}%)`,
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
        <span class="tx-amount ${amtCls}">${amtSign}${_fmtAmount(tx.amount)}</span>
      </td>
    </tr>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   Skeleton state helpers
   -------------------------------------------------------------------------- */
function _showSkeletons() {
  kpiSkeletons.classList.remove('d-none');    kpiCards.classList.add('d-none');
  chartsSkeletons.classList.remove('d-none'); chartsRow.classList.add('d-none');
  bottomSkeletons.classList.remove('d-none'); bottomRow.classList.add('d-none');
  emptyState.classList.add('d-none');
}

function _hideSkeletons() {
  kpiSkeletons.classList.add('d-none');
  chartsSkeletons.classList.add('d-none');
  bottomSkeletons.classList.add('d-none');
}

/* --------------------------------------------------------------------------
   Load dashboard
   -------------------------------------------------------------------------- */
async function loadDashboard() {
  _showSkeletons();

  let data;
  try {
    data = await DashboardService.getSummary();
  } catch (err) {
    _hideSkeletons();
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
    return;
  }

  _hideSkeletons();

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
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  await loadDashboard();
}

init();
