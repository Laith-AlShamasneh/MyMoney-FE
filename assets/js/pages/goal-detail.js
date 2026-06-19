/**
 * pages/goal-detail.js — MyMoney
 * Goal detail page: hero ring, progress stats, milestone track, contribution timeline, linked recurring.
 */

import { initI18n, t, getLanguage }  from '../core/i18n.js';
import { initLayout }                 from '../components/layout.js';
import { guardPage }                  from '../core/auth.js';
import { GoalService }                from '../services/goal-service.js';
import { RecurringService }           from '../services/recurring-service.js';
import { ApiError }                   from '../core/api.js';
import { showSuccess, showError }     from '../components/toast.js';
import { Config }                     from '../core/config.js';

/* ── Constants ──────────────────────────────────────────────────────────────── */
const RING_C_LG = 502.65; // 2π × r80
const CONTRIB_PAGE_SIZE = 20;

const GOAL_COLORS = {
  1:'#22c55e',2:'#3b82f6',3:'#6366f1',
  4:'#06b6d4',5:'#f59e0b',6:'#10b981',
  7:'#ef4444',8:'#8b5cf6',
};
const GOAL_ICONS = {
  1:'bi-shield-check',   2:'bi-car-front-fill',
  3:'bi-house-heart-fill',4:'bi-airplane-fill',
  5:'bi-mortarboard-fill',6:'bi-graph-up-arrow',
  7:'bi-arrow-down-circle-fill',8:'bi-star-fill',
};
const GOAL_TYPE_KEYS = {
  1:'type_emergency_fund',2:'type_car',3:'type_home',4:'type_vacation',
  5:'type_education',6:'type_investment',7:'type_debt_payoff',8:'type_custom',
};

/* ── State ──────────────────────────────────────────────────────────────────── */
let _goal          = null;
let _goalId        = null;
let _contribPage   = 1;
let _contribTotal  = 0;

let _contributeModal  = null;
let _withdrawModal    = null;
let _adjustModal      = null;
let _editModal        = null;
let _deleteModal      = null;
let _completedModal   = null;
let _linkRecurringModal = null;

/* ── DOM helpers ────────────────────────────────────────────────────────────── */
const $     = id  => document.getElementById(id);
const _show = el  => el?.classList.remove('d-none');
const _hide = el  => el?.classList.add('d-none');
const _esc  = str => {
  const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML;
};

/* ── Formatters ─────────────────────────────────────────────────────────────── */
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

function _fmtMonth(dateStr) {
  if (!dateStr) return t('goals.no_est');
  const lang = getLanguage();
  const d = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-JO' : 'en-US', {
    year: 'numeric', month: 'short',
  }).format(d);
}

function _today() { return new Date().toISOString().split('T')[0]; }

/* ── Goal helpers ───────────────────────────────────────────────────────────── */
function _goalColor(typeId)    { return GOAL_COLORS[typeId] || 'var(--mm-primary)'; }
function _goalIcon(typeId)     { return GOAL_ICONS[typeId]  || 'bi-star'; }
function _goalTypeName(typeId) { return t(`goals.${GOAL_TYPE_KEYS[typeId] || 'type_custom'}`); }

function _statusLabel(s) {
  return t(['','goals.status_active','goals.status_paused','goals.status_completed','goals.status_archived'][s] || 'goals.status_active');
}
function _statusCls(s) {
  return ['','goal-status-active','goal-status-paused','goal-status-completed','goal-status-archived'][s] || 'goal-status-active';
}
function _priorityLabel(p) {
  return t(['','goals.priority_low','goals.priority_medium','goals.priority_high','goals.priority_critical'][p] || 'goals.priority_medium');
}
function _priorityCls(p) {
  return ['','goal-pri-low','goal-pri-medium','goal-pri-high','goal-pri-critical'][p] || 'goal-pri-medium';
}
function _priorityIcon(p) {
  return ['','bi-arrow-down','bi-dash','bi-arrow-up','bi-exclamation-triangle-fill'][p] || 'bi-dash';
}

function _daysLeft(targetDate) {
  if (!targetDate) return null;
  const d = new Date(String(targetDate).includes('T') ? targetDate : targetDate + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}

function _targetDateText(goal) {
  if (!goal.targetDate) return t('goals.no_target_date');
  if (goal.statusId === 3) return t('goals.completed_on', { date: _fmtDate(goal.completedAt || goal.targetDate) });
  const days = _daysLeft(goal.targetDate);
  if (days === null) return t('goals.no_target_date');
  if (days < 0)      return t('goals.days_overdue', { days: Math.abs(days) });
  if (days === 0)    return t('goals.today');
  return t('goals.days_remaining', { days });
}

/* ── Progress ring animation ────────────────────────────────────────────────── */
function _animateLargeRing(pct, color) {
  const fill = $('heroRingFill');
  if (!fill) return;
  fill.style.stroke = color;
  requestAnimationFrame(() => {
    setTimeout(() => {
      fill.style.strokeDasharray  = String(RING_C_LG);
      fill.style.strokeDashoffset = String(RING_C_LG * (1 - Math.min(pct, 100) / 100));
    }, 250);
  });
}

/* ── Render hero section ────────────────────────────────────────────────────── */
function _renderHero(goal) {
  const color = _goalColor(goal.goalTypeId);
  const pct   = goal.progress?.completionPercent ?? 0;

  // Ring
  $('heroPct').textContent = `${Math.round(pct)}%`;
  _animateLargeRing(pct, color);
  $('heroRingWrap').style.setProperty('--goal-color', color);

  // Type icon
  const typeIcon = $('heroTypeIcon');
  typeIcon.style.background = `${color}1a`;
  typeIcon.style.color      = color;
  typeIcon.innerHTML        = `<i class="bi ${_goalIcon(goal.goalTypeId)}"></i>`;
  $('heroTypeName').textContent = _goalTypeName(goal.goalTypeId);

  // Status + priority
  const statusEl = $('heroStatus');
  statusEl.textContent = _statusLabel(goal.statusId);
  statusEl.className   = `goal-status-badge ${_statusCls(goal.statusId)}`;

  const priEl = $('heroPriority');
  priEl.innerHTML   = `<i class="bi ${_priorityIcon(goal.priority)} me-1"></i>${_esc(_priorityLabel(goal.priority))}`;
  priEl.className   = `goal-pri-badge ${_priorityCls(goal.priority)}`;

  // Name + description
  $('heroGoalName').textContent = goal.name ?? '';
  const descEl = $('heroDesc');
  if (goal.description) {
    descEl.textContent = goal.description;
    _show(descEl);
  } else {
    _hide(descEl);
  }

  // Date
  $('heroDateText').textContent = _targetDateText(goal);
  const days = _daysLeft(goal.targetDate);
  if (days !== null && days < 0 && goal.statusId !== 3) {
    $('heroDateText').style.color = 'var(--mm-danger)';
  } else if (days !== null && days <= 30 && goal.statusId !== 3) {
    $('heroDateText').style.color = 'var(--mm-warning)';
  }

  // Hero stripe colour
  $('detailHero').style.setProperty('--goal-color', color);
  $('detailHero').style.borderTop = `4px solid ${color}`;

  // Pause/Resume button
  const prBtn = $('detailPauseResumeBtn');
  const isPaused    = goal.statusId === 2;
  const isCompleted = goal.statusId === 3;
  prBtn.innerHTML = isPaused
    ? `<i class="bi bi-play-circle me-1"></i>${t('goals.resume_btn')}`
    : `<i class="bi bi-pause-circle me-1"></i>${t('goals.pause_btn')}`;
  prBtn.disabled = isCompleted;

  // Disable action buttons if completed or paused
  $('detailContributeBtn').disabled = isPaused || isCompleted;
  $('detailWithdrawBtn').disabled   = isPaused || isCompleted;
}

/* ── Render progress stats ──────────────────────────────────────────────────── */
function _renderStats(goal) {
  const p = goal.progress;
  if (!p) { $('detailStatsGrid').innerHTML = ''; return; }

  const onTrack   = p.onTrack;
  const hasDate   = !!goal.targetDate;

  const stats = [
    { val: _fmtCurrency(p.savedAmount),      lbl: 'goals.progress_saved' },
    { val: _fmtCurrency(p.remainingAmount),  lbl: 'goals.progress_remaining' },
    { val: p.avgMonthlyContribution != null  ? _fmtCurrency(p.avgMonthlyContribution) : t('goals.no_est'),
                                             lbl: 'goals.progress_avg_monthly' },
    { val: p.estimatedCompletionDate         ? _fmtMonth(p.estimatedCompletionDate) : t('goals.no_est'),
                                             lbl: 'goals.progress_est_completion' },
    hasDate ? {
      val: onTrack != null ? t(onTrack ? 'goals.progress_on_track' : 'goals.progress_behind') : t('goals.no_est'),
      lbl: '',
      cls: onTrack === true ? 'goal-stat-on-track' : onTrack === false ? 'goal-stat-behind' : '',
    } : null,
    p.monthlySavingsNeeded != null ? {
      val: _fmtCurrency(p.monthlySavingsNeeded), lbl: 'goals.progress_monthly_needed',
    } : null,
  ].filter(Boolean);

  $('detailStatsGrid').innerHTML = stats.map(s => `
    <div class="goal-stat-card${s.cls ? ` ${s.cls}` : ''}">
      <div class="goal-stat-val">${_esc(s.val)}</div>
      ${s.lbl ? `<div class="goal-stat-lbl">${t(s.lbl)}</div>` : ''}
    </div>`).join('');
}

/* ── Render milestone track ─────────────────────────────────────────────────── */
function _renderMilestones(goal) {
  const milestones = goal.milestones ?? [];
  const reached    = new Set(milestones.map(m => m.milestonePercent));
  const pct        = goal.progress?.completionPercent ?? 0;
  const color      = _goalColor(goal.goalTypeId);

  const trackPct = Math.min(pct, 100);

  const markers = [25, 50, 75, 100].map(mp => {
    const isReached = reached.has(mp) || pct >= mp;
    const left      = mp;
    const m = milestones.find(m => m.milestonePercent === mp);
    return { mp, isReached, left, date: m?.reachedAt };
  });

  const milestoneTrackEl = $('milestoneTrack');
  milestoneTrackEl.style.setProperty('--goal-color', color);
  milestoneTrackEl.innerHTML = `
    <div class="milestone-track-rail">
      <div class="milestone-track-progress" style="width:${trackPct}%"></div>
      <div class="milestone-markers">
        ${markers.map(m => `
          <div class="milestone-marker${m.isReached ? ' reached' : ''}" style="${getLanguage() === 'ar' ? 'right' : 'left'}:${m.left}%">
            <div class="milestone-dot${m.isReached ? ' reached' : ''}">
              ${m.isReached ? '<i class="bi bi-check-lg"></i>' : `<span style="font-size:0.55rem">${m.mp}%</span>`}
            </div>
            <div class="milestone-label">
              ${_esc(t(`goals.milestone_${m.mp}`))}
              ${m.date && m.isReached ? `<br><small>${_fmtDate(m.date)}</small>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

/* ── Contribution type helpers ──────────────────────────────────────────────── */
function _contribTypeBadge(contrib) {
  if (contrib.isDebit) {
    if (contrib.contributionTypeId === 3) return { cls:'contrib-badge-adjust',  lbl: t('goals.contrib_type_adjustment') };
    return { cls:'contrib-badge-debit',   lbl: t('goals.contrib_type_withdrawal') };
  }
  if (contrib.contributionTypeId === 4) return { cls:'contrib-badge-auto',   lbl: t('goals.contrib_type_automatic') };
  if (contrib.contributionTypeId === 3) return { cls:'contrib-badge-adjust',  lbl: t('goals.contrib_type_adjustment') };
  return { cls:'contrib-badge-credit',  lbl: t('goals.contrib_type_contribution') };
}

function _contribItemCls(contrib) {
  if (contrib.contributionTypeId === 4) return 'contrib-auto';
  if (contrib.contributionTypeId === 3) return 'contrib-adjust';
  if (contrib.isDebit) return 'contrib-debit';
  return 'contrib-credit';
}

/* ── Load + render contributions ────────────────────────────────────────────── */
async function _loadContributions(append = false) {
  if (!append) {
    _contribPage = 1;
    _show($('contribLoading'));
    _hide($('contribTimeline'));
    _hide($('contribEmpty'));
  }

  try {
    const res = await GoalService.getContributions({
      goalId:    _goalId,
      pageNumber:_contribPage,
      pageSize:  CONTRIB_PAGE_SIZE,
    });

    const items = res.items ?? [];
    _contribTotal = res.totalCount ?? 0;
    _hide($('contribLoading'));

    if (!items.length && !append) {
      _show($('contribEmpty'));
      _hide($('contribLoadMoreWrap'));
      return;
    }

    const timeline = $('contribTimeline');
    _show(timeline);

    const html = items.map(c => {
      const badge  = _contribTypeBadge(c);
      const sign   = c.isDebit ? '−' : '+';
      const amtCls = c.isDebit ? 'contrib-amount-debit' : 'contrib-amount-credit';
      return `
        <div class="contrib-item ${_contribItemCls(c)}">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <span class="contrib-type-badge ${badge.cls}">${_esc(badge.lbl)}</span>
              ${c.notes ? `<p class="text-muted small mb-0 mt-1">${_esc(c.notes)}</p>` : ''}
            </div>
            <div class="text-end flex-shrink-0">
              <div class="${amtCls}">${sign}${_esc(_fmtCurrency(c.amount))}</div>
              <div class="text-muted" style="font-size:0.72rem">${_fmtDate(c.contributionDate)}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    if (append) {
      timeline.insertAdjacentHTML('beforeend', html);
    } else {
      timeline.innerHTML = html;
    }

    const loaded = (_contribPage - 1) * CONTRIB_PAGE_SIZE + items.length;
    if (loaded < _contribTotal) {
      _show($('contribLoadMoreWrap'));
    } else {
      _hide($('contribLoadMoreWrap'));
    }
  } catch (err) {
    _hide($('contribLoading'));
    if (err instanceof ApiError) showError(err.message || t('goals.error'));
  }
}

/* ── Render linked recurring ────────────────────────────────────────────────── */
function _renderLinkedRecurring(links) {
  const el = $('linkedRecurringList');
  if (!links || !links.length) {
    el.innerHTML = `<p class="text-muted mb-0" data-i18n="goals.linked_recurring_empty">${t('goals.linked_recurring_empty')}</p>`;
    return;
  }

  const freqKeys = ['','recurring.freq_daily','recurring.freq_weekly','recurring.freq_monthly',
    'recurring.freq_quarterly','recurring.freq_yearly','recurring.freq_custom'];

  el.innerHTML = links.map(link => `
    <div class="d-flex align-items-center justify-content-between py-2 border-bottom">
      <div>
        <div class="fw-semibold">${_esc(link.recurringName)}</div>
        <div class="text-muted small">
          ${_esc(_fmtCurrency(link.recurringAmount))} ·
          ${t(freqKeys[link.frequencyId] || 'recurring.freq_custom')}
        </div>
      </div>
      <button class="btn btn-sm btn-outline-danger unlink-recurring-btn"
              data-link-id="${link.linkId}"
              data-recurring-id="${link.recurringDefinitionId}"
              title="${t('goals.unlink_btn')}">
        <i class="bi bi-x-circle"></i>
      </button>
    </div>`).join('');

  // Bind unlink buttons
  el.querySelectorAll('.unlink-recurring-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('goals.unlink_confirm'))) return;
      btn.disabled = true;
      try {
        await GoalService.unlinkRecurring(_goalId, Number(btn.dataset.recurringId));
        showSuccess(t('goals.unlink_success'));
        await _refreshGoal();
      } catch (err) {
        showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
        btn.disabled = false;
      }
    });
  });
}

/* ── Link recurring modal ───────────────────────────────────────────────────── */
async function _openLinkRecurringModal() {
  _show($('linkRecurringLoading'));
  _hide($('linkRecurringList'));
  _hide($('linkRecurringEmpty'));
  _linkRecurringModal.show();

  try {
    const res = await RecurringService.getList({ statusId: 1, pageNumber: 1, pageSize: 50 });
    const items = res.items ?? [];
    _hide($('linkRecurringLoading'));

    if (!items.length) {
      _show($('linkRecurringEmpty'));
      return;
    }

    const linked = new Set((_goal?.recurringLinks ?? []).map(l => l.recurringDefinitionId));
    const freqKeys = ['','recurring.freq_daily','recurring.freq_weekly','recurring.freq_monthly',
      'recurring.freq_quarterly','recurring.freq_yearly','recurring.freq_custom'];

    $('linkRecurringList').innerHTML = items.map(item => {
      const alreadyLinked = linked.has(item.id ?? item.recurringDefinitionId ?? item.recurringId);
      return `
        <div class="d-flex align-items-center justify-content-between py-2 border-bottom">
          <div>
            <div class="fw-semibold">${_esc(item.name)}</div>
            <div class="text-muted small">
              ${_esc(_fmtCurrency(item.amount))} ·
              ${t(freqKeys[item.frequencyId] || 'recurring.freq_custom')}
            </div>
          </div>
          <button class="btn btn-sm ${alreadyLinked ? 'btn-success disabled' : 'btn-outline-primary'} link-recurring-select-btn"
                  data-rec-id="${item.id ?? item.recurringDefinitionId}"
                  ${alreadyLinked ? 'disabled' : ''}>
            ${alreadyLinked ? `<i class="bi bi-check-circle"></i>` : t('goals.link_recurring_select')}
          </button>
        </div>`;
    }).join('');

    _show($('linkRecurringList'));

    $('linkRecurringList').querySelectorAll('.link-recurring-select-btn:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
        try {
          await GoalService.linkRecurring(_goalId, Number(btn.dataset.recId));
          _linkRecurringModal.hide();
          showSuccess(t('goals.link_success'));
          await _refreshGoal();
        } catch (err) {
          showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
          btn.disabled = false;
          btn.textContent = t('goals.link_recurring_select');
        }
      });
    });
  } catch (err) {
    _hide($('linkRecurringLoading'));
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
  }
}

/* ── Refresh goal data ──────────────────────────────────────────────────────── */
async function _refreshGoal() {
  try {
    _goal = await GoalService.getById(_goalId);
    _renderHero(_goal);
    _renderStats(_goal);
    _renderMilestones(_goal);
    _renderLinkedRecurring(_goal.recurringLinks ?? []);
    await _loadContributions(false);
  } catch (err) {
    if (err instanceof ApiError) showError(err.message || t('goals.error'));
  }
}

/* ── Action modal helpers ───────────────────────────────────────────────────── */
function _openContribute() {
  $('ctbAmount').value = '';
  $('ctbDate').value   = _today();
  $('ctbNotes').value  = '';
  _contributeModal.show();
}

function _openWithdraw() {
  $('wthAmount').value = '';
  $('wthDate').value   = _today();
  $('wthNotes').value  = '';
  _withdrawModal.show();
}

function _openAdjust() {
  $('adjCurrentVal').textContent = _fmtCurrency(_goal?.currentAmount);
  $('adjNewAmount').value = _goal?.currentAmount ?? '';
  $('adjDate').value   = _today();
  $('adjNotes').value  = '';
  _adjustModal.show();
}

function _openEdit() {
  if (!_goal) return;
  $('editName').value         = _goal.name ?? '';
  $('editDesc').value         = _goal.description ?? '';
  $('editTargetAmount').value = _goal.targetAmount ?? '';
  $('editTargetDate').value   = _goal.targetDate ? String(_goal.targetDate).split('T')[0] : '';
  $('editPriority').value     = String(_goal.priority ?? 2);
  _editModal.show();
}

async function _submitContribute() {
  const btn = $('ctbSubmitBtn');
  const amount = parseFloat($('ctbAmount').value);
  if (!amount || amount <= 0) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
  try {
    const res = await GoalService.contribute({
      goalId: _goalId, amount,
      notes:            $('ctbNotes').value.trim() || null,
      contributionDate: $('ctbDate').value,
    });
    _contributeModal.hide();
    showSuccess(t('goals.contributed_success'));
    if (res.goalCompleted) {
      $('completedGoalDesc').textContent = t('goals.completed_desc', { name: _goal?.name ?? '' });
      setTimeout(() => _completedModal.show(), 500);
    }
    await _refreshGoal();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('goals.modal_confirm');
  }
}

async function _submitWithdraw() {
  const btn = $('wthSubmitBtn');
  const amount = parseFloat($('wthAmount').value);
  if (!amount || amount <= 0) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
  try {
    await GoalService.withdraw({
      goalId: _goalId, amount,
      notes:            $('wthNotes').value.trim() || null,
      contributionDate: $('wthDate').value,
    });
    _withdrawModal.hide();
    showSuccess(t('goals.withdrawn_success'));
    await _refreshGoal();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('goals.modal_confirm');
  }
}

async function _submitAdjust() {
  const btn = $('adjSubmitBtn');
  const newAmount = parseFloat($('adjNewAmount').value);
  if (newAmount < 0 || isNaN(newAmount)) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
  try {
    await GoalService.adjust({
      goalId: _goalId, newAmount,
      notes:          $('adjNotes').value.trim() || null,
      adjustmentDate: $('adjDate').value,
    });
    _adjustModal.hide();
    showSuccess(t('goals.adjusted_success'));
    await _refreshGoal();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('goals.modal_confirm');
  }
}

async function _submitEdit() {
  const btn = $('editSaveBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('goals.edit_saving')}`;
  try {
    await GoalService.update({
      id:           _goalId,
      name:         $('editName').value.trim(),
      description:  $('editDesc').value.trim() || null,
      targetAmount: parseFloat($('editTargetAmount').value),
      targetDate:   $('editTargetDate').value || null,
      priority:     parseInt($('editPriority').value, 10),
    });
    _editModal.hide();
    showSuccess(t('goals.updated_success'));
    await _refreshGoal();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('goals.edit_save');
  }
}

async function _submitDelete() {
  const btn = $('deleteConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('goals.deleting')}`;
  try {
    await GoalService.remove(_goalId);
    _deleteModal.hide();
    showSuccess(t('goals.deleted_success'));
    setTimeout(() => { window.location.href = Config.ROUTES.GOALS; }, 1000);
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
    btn.disabled = false;
    btn.textContent = t('goals.delete_confirm_btn');
  }
}

/* ── Main ────────────────────────────────────────────────────────────────────── */
(async () => {
  await initI18n();
  await guardPage();
  initLayout();

  // Parse goal ID from query string
  const params = new URLSearchParams(window.location.search);
  _goalId = Number(params.get('id'));
  if (!_goalId) {
    _hide($('detailSkeleton'));
    _show($('detailNotFound'));
    return;
  }

  // Bootstrap modals
  _contributeModal    = new bootstrap.Modal($('contributeModal'));
  _withdrawModal      = new bootstrap.Modal($('withdrawModal'));
  _adjustModal        = new bootstrap.Modal($('adjustModal'));
  _editModal          = new bootstrap.Modal($('editGoalModal'));
  _deleteModal        = new bootstrap.Modal($('deleteGoalModal'));
  _completedModal     = new bootstrap.Modal($('goalCompletedModal'));
  _linkRecurringModal = new bootstrap.Modal($('linkRecurringModal'));

  // Fix RTL back arrow
  if (getLanguage() !== 'ar') {
    const backIcon = $('backLink')?.querySelector('i');
    if (backIcon) backIcon.className = 'bi bi-arrow-left';
  }

  // Load goal
  try {
    _goal = await GoalService.getById(_goalId);
  } catch (err) {
    _hide($('detailSkeleton'));
    _show($('detailNotFound'));
    return;
  }

  if (!_goal) {
    _hide($('detailSkeleton'));
    _show($('detailNotFound'));
    return;
  }

  _hide($('detailSkeleton'));
  _show($('detailContent'));

  // Update page title
  document.title = `${_goal.name} | MyMoney`;

  // Render all sections
  _renderHero(_goal);
  _renderStats(_goal);
  _renderMilestones(_goal);
  _renderLinkedRecurring(_goal.recurringLinks ?? []);
  await _loadContributions(false);

  // ── Event bindings ─────────────────────────────────────────────────────── //
  $('detailContributeBtn').addEventListener('click', _openContribute);
  $('detailWithdrawBtn').addEventListener('click', _openWithdraw);
  $('detailAdjustBtn').addEventListener('click', _openAdjust);
  $('detailEditBtn').addEventListener('click', _openEdit);
  $('detailDeleteBtn').addEventListener('click', () => _deleteModal.show());

  $('detailPauseResumeBtn').addEventListener('click', async () => {
    const btn = $('detailPauseResumeBtn');
    btn.disabled = true;
    try {
      if (_goal.statusId === 2) {
        await GoalService.resume(_goalId);
        showSuccess(t('goals.resumed_success'));
      } else {
        await GoalService.pause(_goalId);
        showSuccess(t('goals.paused_success'));
      }
      await _refreshGoal();
    } catch (err) {
      showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
      btn.disabled = false;
    }
  });

  $('ctbSubmitBtn').addEventListener('click', _submitContribute);
  $('wthSubmitBtn').addEventListener('click', _submitWithdraw);
  $('adjSubmitBtn').addEventListener('click', _submitAdjust);
  $('editSaveBtn').addEventListener('click', _submitEdit);
  $('deleteConfirmBtn').addEventListener('click', _submitDelete);
  $('linkRecurringBtn').addEventListener('click', _openLinkRecurringModal);

  $('contribLoadMoreBtn').addEventListener('click', async () => {
    _contribPage++;
    $('contribLoadMoreBtn').disabled = true;
    await _loadContributions(true);
    $('contribLoadMoreBtn').disabled = false;
  });
})();
