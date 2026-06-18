/**
 * pages/financial-intelligence.js — MyMoney
 * Financial Intelligence Center: health score, insights, recommendations, patterns.
 */

import { initI18n, t, getLanguage }    from '../core/i18n.js';
import { initLayout }                   from '../components/layout.js';
import { guardPage }                    from '../core/auth.js';
import { FinancialIntelligenceService } from '../services/financial-intelligence-service.js';
import { ApiError }                     from '../core/api.js';
import { showError, showSuccess }       from '../components/toast.js';

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const filPageSkeleton   = document.getElementById('filPageSkeleton');
const filNoData         = document.getElementById('filNoData');
const filContent        = document.getElementById('filContent');

const healthScoreRing   = document.getElementById('healthScoreRing');
const healthScoreNum    = document.getElementById('healthScoreNum');
const healthScoreLevel  = document.getElementById('healthScoreLevel');
const healthScoreContext= document.getElementById('healthScoreContext');
const healthBreakdown   = document.getElementById('healthBreakdown');
const healthStats       = document.getElementById('healthStats');

const categoryTrendsEmpty = document.getElementById('categoryTrendsEmpty');
const categoryTrendsList  = document.getElementById('categoryTrendsList');

const patternsEmpty     = document.getElementById('patternsEmpty');
const patternsList      = document.getElementById('patternsList');

const insightUnreadBadge= document.getElementById('insightUnreadBadge');
const insightsEmpty     = document.getElementById('insightsEmpty');
const insightsList      = document.getElementById('insightsList');
const insightsGrid      = document.getElementById('insightsGrid');
const insightsLoadMoreBtn = document.getElementById('insightsLoadMoreBtn');
const insightsLoadMore  = document.getElementById('insightsLoadMore');

const recsEmpty         = document.getElementById('recsEmpty');
const recsList          = document.getElementById('recsList');
const recsGrid          = document.getElementById('recsGrid');

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
let _lastDashData = null;
let _insightsPage = 1;
let _insightsTotalCount = 0;
const PAGE_SIZE_INSIGHTS = 12;

/* --------------------------------------------------------------------------
   Formatting helpers
   -------------------------------------------------------------------------- */
const _lang = () => getLanguage();

function _fmtAmount(value) {
  return new Intl.NumberFormat(_lang() === 'ar' ? 'ar-JO' : 'en-US', {
    style: 'currency', currency: 'JOD', minimumFractionDigits: 3,
  }).format(value ?? 0);
}

function _esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

/* --------------------------------------------------------------------------
   FIL domain helpers
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

function _scoreLevelKey(cls) {
  return cls.replace('fil-score-', '').replace(/-/g, '_');
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

function _priKey(priority) {
  return priority >= 3 ? 'high' : priority >= 2 ? 'medium' : 'low';
}

/* TrendDirection: 1=Stable, 2=Up, 3=Down */
function _trendCls(direction) {
  return direction === 2 ? 'fil-trend-up' : direction === 3 ? 'fil-trend-down' : 'fil-trend-stable';
}
function _trendIcon(direction) {
  return direction === 2 ? 'bi-arrow-up-short' : direction === 3 ? 'bi-arrow-down-short' : 'bi-dash';
}
function _trendLabelKey(direction) {
  return direction === 2 ? 'fil.trend_up_label' : direction === 3 ? 'fil.trend_down_label' : 'fil.trend_stable_label';
}

/* --------------------------------------------------------------------------
   Health score rendering
   -------------------------------------------------------------------------- */
function _renderHealth(snapshot, insights = []) {
  const score = _computeHealthScore(snapshot, insights);
  if (score === null) return;

  const levelCls = _scoreLevelCls(score);
  const levelKey = _scoreLevelKey(levelCls);

  healthScoreRing.style.setProperty('--score', score);
  healthScoreRing.className = `fil-score-ring fil-score-ring-lg ${levelCls}`;
  healthScoreNum.textContent = score;

  healthScoreLevel.className = `fil-score-level ${levelCls}`;
  healthScoreLevel.textContent = t(`fil.score_${levelKey}`);

  healthScoreContext.textContent = snapshot
    ? `${t('fil.score_savings')}: ${Math.round((snapshot.netBalance / snapshot.totalIncome) * 100)}%`
    : '';

  /* Breakdown bars */
  if (snapshot) {
    const expRatio    = snapshot.totalExpense / snapshot.totalIncome;
    const savingsRate = Math.max(0, snapshot.netBalance / snapshot.totalIncome);
    const cnt         = snapshot.transactionCount || 0;
    const actPct      = cnt >= 10 ? 100 : cnt >= 5 ? 75 : cnt >= 2 ? 50 : cnt >= 1 ? 25 : 0;

    healthBreakdown.innerHTML = [
      { labelKey: 'fil.score_savings',      pct: Math.round(savingsRate * 100),      color: 'var(--mm-success)' },
      { labelKey: 'fil.score_expense_ctrl', pct: Math.round((1 - expRatio) * 100),   color: 'var(--mm-primary)' },
      { labelKey: 'fil.score_activity',     pct: actPct,                              color: 'var(--mm-info)'    },
    ].map(({ labelKey, pct, color }) => {
      const clampedPct = Math.max(0, Math.min(100, pct));
      return `<div class="fil-breakdown-item">
        <div class="fil-breakdown-label">
          <span>${t(labelKey)}</span>
          <span>${clampedPct}%</span>
        </div>
        <div class="fil-breakdown-bar">
          <div class="fil-breakdown-fill" style="width:${clampedPct}%;background:${color};"></div>
        </div>
      </div>`;
    }).join('');

    /* Key stats */
    healthStats.innerHTML = [
      { labelKey: 'dashboard.kpi_income',   value: _fmtAmount(snapshot.totalIncome),          cls: 'text-success' },
      { labelKey: 'dashboard.kpi_expenses', value: _fmtAmount(snapshot.totalExpense),          cls: 'text-danger'  },
      { labelKey: 'fil.score_activity',     value: snapshot.transactionCount, cls: '' },
    ].map(({ labelKey, value, cls }) => `
      <div class="col-6 col-lg-12">
        <div class="kpi-card" style="padding:0.75rem 1rem;">
          <span class="kpi-label d-block" style="font-size:0.65rem;">${t(labelKey)}</span>
          <span class="kpi-value d-block ${cls}" style="font-size:1rem;margin:0.2rem 0 0;">${_esc(String(value))}</span>
        </div>
      </div>`).join('');
  }
}

/* --------------------------------------------------------------------------
   Category trends rendering
   -------------------------------------------------------------------------- */
function _renderCategoryTrends(trends = []) {
  if (!trends.length) {
    categoryTrendsEmpty.classList.remove('d-none');
    categoryTrendsList.classList.add('d-none');
    return;
  }

  categoryTrendsEmpty.classList.add('d-none');
  categoryTrendsList.classList.remove('d-none');

  categoryTrendsList.innerHTML = trends.slice(0, 8).map(cat => {
    const trendCls  = _trendCls(cat.trendDirection);
    const trendIcon = _trendIcon(cat.trendDirection);
    const changePct = cat.changePercentage;
    const isUp      = cat.trendDirection === 2;
    const changeClr = isUp ? 'var(--mm-danger)' : cat.trendDirection === 3 ? 'var(--mm-success)' : 'var(--mm-muted)';

    return `<div class="fil-cat-trend">
      <div class="fil-trend-icon ${trendCls}" title="${t(_trendLabelKey(cat.trendDirection))}">
        <i class="bi ${trendIcon}" aria-hidden="true"></i>
      </div>
      <span class="fil-cat-name">${_esc(cat.categoryName)}</span>
      <span class="fil-cat-amount text-muted">${_fmtAmount(cat.totalSpent)}</span>
      <span class="fil-cat-change" style="color:${changeClr};">
        ${changePct !== null && changePct !== undefined ? `${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%` : '—'}
      </span>
    </div>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   Patterns rendering
   -------------------------------------------------------------------------- */
function _renderPatterns(patterns = []) {
  if (!patterns.length) {
    patternsEmpty.classList.remove('d-none');
    patternsList.classList.add('d-none');
    return;
  }

  patternsEmpty.classList.add('d-none');
  patternsList.classList.remove('d-none');

  patternsList.innerHTML = `<div class="d-grid gap-2">` + patterns.map(p => {
    const confPct = Math.round(p.confidenceScore);
    return `<div class="fil-pattern-card">
      <div class="d-flex align-items-start justify-content-between gap-2">
        <p class="mb-0 small fw-semibold">${_esc(p.patternTypeName)}</p>
        <span class="text-muted" style="font-size:0.7rem;white-space:nowrap;">${_timeAgo(p.detectedAtUtc)}</span>
      </div>
      <p class="text-muted mb-1" style="font-size:0.78rem;margin-top:0.25rem;">${_esc(p.description)}</p>
      <div class="d-flex align-items-center gap-2">
        <div class="fil-pattern-confidence flex-grow-1">
          <div class="fil-pattern-confidence-fill" style="width:${confPct}%"></div>
        </div>
        <span class="text-muted" style="font-size:0.7rem;white-space:nowrap;">${t('fil.confidence')}: ${confPct}%</span>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

/* --------------------------------------------------------------------------
   Insights rendering
   -------------------------------------------------------------------------- */
function _renderInsightCard(insight) {
  const sevCls = _sevCls(insight.severity);
  const unread = !insight.isRead;

  return `<div class="col-md-6 col-xl-4">
    <div class="fil-insight-card ${sevCls}${unread ? ' fil-unread' : ''}" data-insight-id="${insight.insightId}">
      <div class="d-flex align-items-start gap-2 mb-2">
        <div class="fil-sev-icon ${sevCls}">
          <i class="bi ${_sevIcon(insight.severity)}" aria-hidden="true"></i>
        </div>
        <div class="flex-grow-1 min-width-0 d-flex align-items-center gap-2 flex-wrap" style="padding-top:0.2rem;">
          <span class="fil-sev-badge ${sevCls}">${t(`fil.sev_${sevCls.replace('fil-sev-', '')}`)}</span>
          ${unread ? `<span class="fil-sev-badge" style="background:var(--mm-primary-light);color:var(--mm-primary);">${t('fil.insight_unread')}</span>` : ''}
          <span class="text-muted ms-auto" style="font-size:0.68rem;">${_timeAgo(insight.generatedAtUtc)}</span>
        </div>
      </div>
      <p class="fw-semibold mb-1" style="font-size:0.875rem;">${_esc(insight.title)}</p>
      <p class="text-muted mb-3" style="font-size:0.8rem;line-height:1.5;">${_esc(insight.description)}</p>
      ${unread ? `<button class="btn btn-sm btn-outline-secondary" style="font-size:0.72rem;padding:0.18rem 0.6rem;"
        data-mark-read="${insight.insightId}">
        <i class="bi bi-check2 me-1" aria-hidden="true"></i>${t('fil.mark_read')}
      </button>` : ''}
    </div>
  </div>`;
}

function _renderInsights(items = [], totalCount = 0, unreadCount = 0) {
  _insightsTotalCount = totalCount;

  if (unreadCount > 0) {
    insightUnreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    insightUnreadBadge.classList.remove('d-none');
  } else {
    insightUnreadBadge.classList.add('d-none');
  }

  if (!items.length) {
    insightsEmpty.classList.remove('d-none');
    insightsList.classList.add('d-none');
    return;
  }

  insightsEmpty.classList.add('d-none');
  insightsList.classList.remove('d-none');

  insightsGrid.innerHTML = items.map(_renderInsightCard).join('');

  if (totalCount > items.length) {
    insightsLoadMore.classList.remove('d-none');
    insightsLoadMoreBtn.textContent = t('fil.view_all');
  } else {
    insightsLoadMore.classList.add('d-none');
  }
}

/* --------------------------------------------------------------------------
   Recommendations rendering
   -------------------------------------------------------------------------- */
function _renderRecCard(rec) {
  const priCls = _priCls(rec.priority);
  const priKey = _priKey(rec.priority);
  const isApplied   = rec.isApplied;
  const isDismissed = rec.isDismissed;

  const impact = rec.expectedImpactValue != null
    ? `<span class="fil-impact ms-1"><i class="bi bi-arrow-down-short" aria-hidden="true"></i>${_fmtAmount(rec.expectedImpactValue)}</span>`
    : '';

  const actions = (!isApplied && !isDismissed) ? `
    <div class="d-flex gap-2 mt-2">
      <button class="btn btn-sm btn-primary" style="font-size:0.72rem;padding:0.2rem 0.7rem;"
              data-apply-rec="${rec.recommendationId}">
        <i class="bi bi-check2 me-1" aria-hidden="true"></i>${t('fil.apply')}
      </button>
      <button class="btn btn-sm btn-outline-secondary" style="font-size:0.72rem;padding:0.2rem 0.7rem;"
              data-dismiss-rec="${rec.recommendationId}">
        ${t('fil.dismiss')}
      </button>
    </div>` : isApplied ? `
    <span class="text-success small mt-2 d-inline-flex align-items-center gap-1">
      <i class="bi bi-check-circle-fill" aria-hidden="true"></i> ${t('fil.applied')}
    </span>` : '';

  return `<div class="col-md-6 col-xl-4">
    <div class="fil-rec-card${isApplied ? ' fil-applied' : ''}" data-rec-id="${rec.recommendationId}">
      <div class="d-flex align-items-start gap-2 mb-2">
        <div class="fil-rec-icon">
          <i class="bi ${_recIcon(rec.type)}" aria-hidden="true"></i>
        </div>
        <div class="flex-grow-1 min-width-0 d-flex align-items-center gap-2 flex-wrap" style="padding-top:0.2rem;">
          <span class="fil-pri-badge ${priCls}">${t(`fil.pri_${priKey}`)}</span>
          ${impact}
        </div>
      </div>
      <p class="fw-semibold mb-1" style="font-size:0.875rem;">${_esc(rec.title)}</p>
      <p class="text-muted mb-1" style="font-size:0.8rem;line-height:1.5;">${_esc(rec.message)}</p>
      ${actions}
    </div>
  </div>`;
}

function _renderRecommendations(items = []) {
  const active = items.filter(r => !r.isDismissed);

  if (!active.length) {
    recsEmpty.classList.remove('d-none');
    recsList.classList.add('d-none');
    return;
  }

  recsEmpty.classList.add('d-none');
  recsList.classList.remove('d-none');
  recsGrid.innerHTML = active.map(_renderRecCard).join('');
}

/* --------------------------------------------------------------------------
   Mark insight read
   -------------------------------------------------------------------------- */
async function _markInsightRead(insightId, btn) {
  btn.disabled = true;
  try {
    await FinancialIntelligenceService.markInsightRead(insightId);
    showSuccess(t('fil.mark_read_success'));
    const card = document.querySelector(`[data-insight-id="${insightId}"]`);
    if (card) {
      card.classList.remove('fil-unread');
      btn.remove();
    }
    const badge = insightUnreadBadge;
    const cur = parseInt(badge.textContent, 10) || 0;
    if (cur <= 1) {
      badge.classList.add('d-none');
    } else {
      badge.textContent = cur - 1;
    }
  } catch (err) {
    btn.disabled = false;
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  }
}

/* --------------------------------------------------------------------------
   Apply / Dismiss recommendation
   -------------------------------------------------------------------------- */
async function _applyRec(recId, btn) {
  btn.disabled = true;
  try {
    await FinancialIntelligenceService.applyRecommendation(recId);
    showSuccess(t('fil.apply_success'));
    const card = document.querySelector(`[data-rec-id="${recId}"]`);
    if (card) {
      card.classList.add('fil-applied');
      card.querySelectorAll('[data-apply-rec],[data-dismiss-rec]').forEach(b => b.remove());
      const applied = document.createElement('span');
      applied.className = 'text-success small mt-2 d-inline-flex align-items-center gap-1';
      applied.innerHTML = `<i class="bi bi-check-circle-fill" aria-hidden="true"></i> ${t('fil.applied')}`;
      card.appendChild(applied);
    }
  } catch (err) {
    btn.disabled = false;
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  }
}

async function _dismissRec(recId, btn) {
  btn.disabled = true;
  try {
    await FinancialIntelligenceService.dismissRecommendation(recId);
    showSuccess(t('fil.dismiss_success'));
    document.querySelector(`[data-rec-id="${recId}"]`)?.closest('.col-md-6, .col-xl-4')?.remove();
    if (recsGrid.children.length === 0) {
      recsList.classList.add('d-none');
      recsEmpty.classList.remove('d-none');
    }
  } catch (err) {
    btn.disabled = false;
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  }
}

/* --------------------------------------------------------------------------
   Tab switching
   -------------------------------------------------------------------------- */
function _initTabs() {
  document.querySelectorAll('.fil-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fil-tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.fil-tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(`tab${btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)}`)
        ?.classList.add('active');
    });
  });
}

/* --------------------------------------------------------------------------
   Event delegation for dynamic buttons
   -------------------------------------------------------------------------- */
function _wireInteractions() {
  document.getElementById('filTabsPanel')?.addEventListener('click', async (e) => {
    const markBtn   = e.target.closest('[data-mark-read]');
    const applyBtn  = e.target.closest('[data-apply-rec]');
    const dismissBtn= e.target.closest('[data-dismiss-rec]');

    if (markBtn)    await _markInsightRead(Number(markBtn.dataset.markRead),   markBtn);
    if (applyBtn)   await _applyRec(Number(applyBtn.dataset.applyRec),        applyBtn);
    if (dismissBtn) await _dismissRec(Number(dismissBtn.dataset.dismissRec), dismissBtn);
  });

  insightsLoadMoreBtn?.addEventListener('click', async () => {
    insightsLoadMoreBtn.disabled = true;
    _insightsPage += 1;
    try {
      const result = await FinancialIntelligenceService.getInsights({
        pageNumber: _insightsPage,
        pageSize:   PAGE_SIZE_INSIGHTS,
      });
      result.items.forEach(insight => {
        const col = document.createElement('div');
        col.innerHTML = _renderInsightCard(insight);
        insightsGrid.appendChild(col.firstElementChild);
      });
      const loaded = _insightsPage * PAGE_SIZE_INSIGHTS;
      if (loaded >= result.totalCount) {
        insightsLoadMore.classList.add('d-none');
      }
    } catch (err) {
      showError(err instanceof ApiError ? err.message : t('errors.unknown'));
    } finally {
      insightsLoadMoreBtn.disabled = false;
    }
  });
}

/* --------------------------------------------------------------------------
   Load page data
   -------------------------------------------------------------------------- */
async function loadPage() {
  filPageSkeleton.classList.remove('d-none');

  const [dashResult, insightsResult, recsResult] = await Promise.allSettled([
    FinancialIntelligenceService.getDashboard(),
    FinancialIntelligenceService.getInsights({ pageNumber: 1, pageSize: PAGE_SIZE_INSIGHTS }),
    FinancialIntelligenceService.getRecommendations({ pageNumber: 1, pageSize: 20 }),
  ]);

  filPageSkeleton.classList.add('d-none');

  /* Check if there is any data at all */
  const dash         = dashResult.status === 'fulfilled' ? dashResult.value : null;
  const insightsData = insightsResult.status === 'fulfilled' ? insightsResult.value : null;
  const recsData     = recsResult.status === 'fulfilled' ? recsResult.value : null;

  // Show content if any meaningful FIS data exists: insights, recommendations,
  // a financial snapshot, spending patterns, or category trends.
  // "No data" only when the system has produced nothing for this user yet.
  const hasAnyData =
    (insightsData?.totalCount ?? 0) > 0 ||
    (recsData?.totalCount ?? 0) > 0 ||
    (dash?.latestSnapshot != null) ||
    (dash?.topInsights?.length ?? 0) > 0 ||
    (dash?.patterns?.length ?? 0) > 0 ||
    (dash?.categoryTrends?.length ?? 0) > 0 ||
    (dash?.recommendations?.length ?? 0) > 0;

  if (!hasAnyData) {
    filNoData.classList.remove('d-none');
    return;
  }

  _lastDashData = dash;
  filContent.classList.remove('d-none');

  _renderHealth(dash?.latestSnapshot ?? null, dash?.topInsights ?? []);
  _renderCategoryTrends(dash?.categoryTrends ?? []);
  _renderPatterns(dash?.patterns ?? []);

  _renderInsights(
    insightsData?.items ?? dash?.topInsights ?? [],
    insightsData?.totalCount ?? (dash?.topInsights?.length ?? 0),
    insightsData?.unreadCount ?? 0,
  );

  _renderRecommendations(recsData?.items ?? dash?.recommendations ?? []);
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  _initTabs();
  _wireInteractions();
  await loadPage();
}

init();
