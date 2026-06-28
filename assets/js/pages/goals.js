/**
 * pages/goals.js — MyMoney
 * Goals & Savings workspace: KPI dashboard, goal cards, wizard, contribution modals.
 */

import { initI18n, t, getLanguage }  from '../core/i18n.js';
import { initLayout }                 from '../components/layout.js';
import { guardPage }                  from '../core/auth.js';
import { GoalService }                from '../services/goal-service.js';
import { RecurringService }           from '../services/recurring-service.js';
import { ApiError }                   from '../core/api.js';
import { showSuccess, showError }     from '../components/toast.js';
import { Config }                     from '../core/config.js';
import { formatAmount }               from '../core/currency.js';
import { initWorkspaceContext }       from '../services/workspace-context.js';

/* ── Constants ──────────────────────────────────────────────────────────────── */
const PAGE_SIZE = 12;
const RING_C    = 238.76; // 2π × r38

const GOAL_COLORS = {
  1: '#22c55e', 2: '#3b82f6', 3: '#6366f1',
  4: '#06b6d4', 5: '#f59e0b', 6: '#10b981',
  7: '#ef4444', 8: '#8b5cf6',
};

const GOAL_ICONS = {
  1: 'bi-shield-check',    2: 'bi-car-front-fill',
  3: 'bi-house-heart-fill',4: 'bi-airplane-fill',
  5: 'bi-mortarboard-fill',6: 'bi-graph-up-arrow',
  7: 'bi-arrow-down-circle-fill', 8: 'bi-star-fill',
};

const GOAL_TYPE_KEYS = {
  1:'type_emergency_fund',2:'type_car',3:'type_home',4:'type_vacation',
  5:'type_education',6:'type_investment',7:'type_debt_payoff',8:'type_custom',
};

/* ── State ──────────────────────────────────────────────────────────────────── */
const _s = {
  page: 1, total: 0,
  statusId: null, typeId: null, priority: null,
  dashboard: null, goals: [],
  wStep: 1, wType: null,
  actionGoalId: null, actionGoalData: null,
};

let _wizardModal = null, _contributeModal = null, _withdrawModal = null;
let _adjustModal = null, _editModal = null, _deleteModal = null, _completedModal = null;

/* ── DOM helpers ────────────────────────────────────────────────────────────── */
const $     = id  => document.getElementById(id);
const _show = el  => el?.classList.remove('d-none');
const _hide = el  => el?.classList.add('d-none');
const _esc  = str => {
  const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML;
};

/* ── Formatters ─────────────────────────────────────────────────────────────── */
function _fmtCurrency(amount) {
  return formatAmount(amount ?? 0);
}

function _fmtDate(dateStr) {
  if (!dateStr) return '—';
  const lang = getLanguage();
  const d = new Date(String(dateStr).includes('T') ? dateStr : dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-JO' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(d);
}

function _today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ── Goal helpers ───────────────────────────────────────────────────────────── */
function _goalColor(typeId)    { return GOAL_COLORS[typeId] || 'var(--mm-primary)'; }
function _goalIcon(typeId)     { return GOAL_ICONS[typeId]  || 'bi-star'; }
function _goalTypeName(typeId) { return t(`goals.${GOAL_TYPE_KEYS[typeId] || 'type_custom'}`); }

function _statusLabel(s) { return t(['','goals.status_active','goals.status_paused','goals.status_completed','goals.status_archived'][s] || 'goals.status_active'); }
function _statusCls(s)   { return ['','goal-status-active','goal-status-paused','goal-status-completed','goal-status-archived'][s] || 'goal-status-active'; }
function _priorityLabel(p){ return t(['','goals.priority_low','goals.priority_medium','goals.priority_high','goals.priority_critical'][p] || 'goals.priority_medium'); }
function _priorityCls(p)  { return ['','goal-pri-low','goal-pri-medium','goal-pri-high','goal-pri-critical'][p] || 'goal-pri-medium'; }

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

function _dateCls(goal) {
  if (goal.statusId === 3) return 'goal-date-completed';
  const days = _daysLeft(goal.targetDate);
  if (days !== null && days < 0)  return 'goal-date-overdue';
  if (days !== null && days <= 30) return 'goal-date-soon';
  return '';
}

/* ── Progress ring ──────────────────────────────────────────────────────────── */
function _animateRing(cardEl, pct, color) {
  const fill = cardEl.querySelector('.goal-ring-fill');
  if (!fill) return;
  fill.style.stroke = color;
  requestAnimationFrame(() => {
    setTimeout(() => {
      fill.style.strokeDashoffset = String(RING_C * (1 - Math.min(pct, 100) / 100));
    }, 180);
  });
}

/* ── Render KPI strip ───────────────────────────────────────────────────────── */
function _renderKpiStrip(kpi) {
  const items = [
    { icon: 'bi-flag-fill',        bg: '#dbeafe', color: '#1e40af',   val: kpi.activeGoalCount,     lbl: 'goals.kpi_active' },
    { icon: 'bi-pause-circle-fill',bg: '#fef9c3', color: '#854d0e',   val: kpi.pausedGoalCount,     lbl: 'goals.kpi_paused' },
    { icon: 'bi-check-circle-fill',bg: '#dcfce7', color: '#166534',   val: kpi.completedGoalCount,  lbl: 'goals.kpi_completed' },
    { icon: 'bi-wallet2',          bg: '#d1fae5', color: '#065f46',   val: _fmtCurrency(kpi.totalSavedAmount),   lbl: 'goals.kpi_saved',      isCurrency: true },
    { icon: 'bi-bullseye',         bg: '#ede9fe', color: '#5b21b6',   val: _fmtCurrency(kpi.totalTargetAmount),  lbl: 'goals.kpi_target',     isCurrency: true },
    { icon: 'bi-hourglass-split',  bg: '#fee2e2', color: '#991b1b',   val: _fmtCurrency(kpi.totalRemainingAmount),lbl: 'goals.kpi_remaining', isCurrency: true },
  ];

  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (dark) {
    items[0].bg='#1e3a5f'; items[1].bg='#422006'; items[2].bg='#14532d';
    items[3].bg='#064e3b'; items[4].bg='#2e1065'; items[5].bg='#450a0a';
  }

  const html = items.map(item => `
    <div class="col-6 col-md-4 col-xl-2">
      <div class="goal-kpi-card">
        <div class="goal-kpi-icon" style="background:${item.bg};color:${item.color}">
          <i class="bi ${item.icon}"></i>
        </div>
        <div>
          <div class="goal-kpi-val">${item.isCurrency ? `<span style="font-size:0.85rem">${_esc(item.val)}</span>` : item.val}</div>
          <div class="goal-kpi-lbl">${t(item.lbl)}</div>
        </div>
      </div>
    </div>`).join('');

  $('goalsKpiStrip').innerHTML = html;
}

/* ── Render one goal card ───────────────────────────────────────────────────── */
function _renderGoalCard(goal) {
  const color = _goalColor(goal.goalTypeId);
  const icon  = _goalIcon(goal.goalTypeId);
  const pct   = goal.completionPercent ?? 0;
  const isCompleted = goal.statusId === 3;
  const isPaused    = goal.statusId === 2;

  return `
<div class="col-12 col-md-6 col-xl-4">
  <div class="goal-card${isPaused ? ' goal-card-paused' : ''}${isCompleted ? ' goal-card-completed' : ''}"
       data-goal-id="${goal.goalId}" style="--goal-color:${color}">
    <div class="goal-card-type-stripe"></div>
    <div class="goal-card-body">

      <div class="goal-card-header">
        <div class="goal-type-icon" style="background:${color}1a;color:${color}">
          <i class="bi ${icon}"></i>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="goal-status-badge ${_statusCls(goal.statusId)}">${_esc(_statusLabel(goal.statusId))}</span>
          <div class="dropdown">
            <button class="goal-menu-btn" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-three-dots-vertical"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-sm">
              <li><button class="dropdown-item goal-action-contribute" data-id="${goal.goalId}"
                  ${isPaused || isCompleted ? 'disabled' : ''}>
                <i class="bi bi-plus-circle me-2 text-success"></i>${t('goals.contribute_btn')}
              </button></li>
              <li><button class="dropdown-item goal-action-withdraw" data-id="${goal.goalId}"
                  ${isPaused || isCompleted ? 'disabled' : ''}>
                <i class="bi bi-dash-circle me-2 text-danger"></i>${t('goals.withdraw_btn')}
              </button></li>
              <li><button class="dropdown-item goal-action-adjust" data-id="${goal.goalId}">
                <i class="bi bi-sliders me-2 text-warning"></i>${t('goals.adjust_btn')}
              </button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item goal-action-edit" data-id="${goal.goalId}">
                <i class="bi bi-pencil me-2"></i>${t('goals.edit_btn')}
              </button></li>
              <li><button class="dropdown-item goal-action-pause-resume" data-id="${goal.goalId}"
                  data-status="${goal.statusId}" ${isCompleted ? 'disabled' : ''}>
                <i class="bi ${isPaused ? 'bi-play-circle' : 'bi-pause-circle'} me-2"></i>
                ${isPaused ? t('goals.resume_btn') : t('goals.pause_btn')}
              </button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item text-danger goal-action-delete" data-id="${goal.goalId}">
                <i class="bi bi-trash me-2"></i>${t('goals.delete_btn')}
              </button></li>
            </ul>
          </div>
        </div>
      </div>

      <h3 class="goal-card-name" title="${_esc(goal.name)}">${_esc(goal.name)}</h3>
      ${goal.description ? `<p class="goal-card-desc text-muted">${_esc(goal.description)}</p>` : '<div class="mb-2"></div>'}

      <div class="goal-ring-wrap">
        <svg class="goal-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="goal-ring-bg" cx="50" cy="50" r="38"/>
          <circle class="goal-ring-fill" cx="50" cy="50" r="38"/>
        </svg>
        <div class="goal-ring-center">
          <div class="goal-ring-pct">${Math.round(pct)}%</div>
          <div class="goal-ring-label">${t('goals.progress_completion')}</div>
        </div>
      </div>

      <div class="goal-amounts-row">
        <div class="goal-amount">
          <div class="goal-amount-val">${_esc(_fmtCurrency(goal.currentAmount))}</div>
          <div class="goal-amount-lbl">${t('goals.progress_saved')}</div>
        </div>
        <div class="goal-amount text-end">
          <div class="goal-amount-val">${_esc(_fmtCurrency(goal.targetAmount))}</div>
          <div class="goal-amount-lbl">${t('goals.progress_target')}</div>
        </div>
      </div>

      <div class="goal-card-footer">
        <div class="goal-target-date-text ${_dateCls(goal)}">
          <i class="bi bi-calendar3"></i>
          <span>${_esc(_targetDateText(goal))}</span>
        </div>
        <div class="d-flex gap-2 align-items-center">
          ${!isPaused && !isCompleted ? `<button class="btn btn-sm btn-primary goal-action-contribute-btn" data-id="${goal.goalId}" title="${t('goals.contribute_btn')}"><i class="bi bi-plus-lg"></i></button>` : ''}
          <a href="${Config.ROUTES.GOAL_DETAIL}?id=${goal.goalId}" class="btn btn-sm btn-outline-secondary" title="${t('goals.view_btn')}">
            <i class="bi bi-eye"></i>
          </a>
        </div>
      </div>

    </div>
  </div>
</div>`;
}

/* ── Render goal grid ───────────────────────────────────────────────────────── */
function _renderGoals() {
  const grid = $('goalsGrid');
  if (!_s.goals.length) {
    grid.innerHTML = '';
    _show($('goalsFilteredEmpty'));
    _hide($('goalsPagination'));
    return;
  }
  _hide($('goalsFilteredEmpty'));
  grid.innerHTML = _s.goals.map(_renderGoalCard).join('');

  // Animate rings after DOM insertion
  grid.querySelectorAll('.goal-card').forEach(card => {
    const id    = Number(card.dataset.goalId);
    const goal  = _s.goals.find(g => g.goalId === id);
    if (goal) _animateRing(card, goal.completionPercent ?? 0, _goalColor(goal.goalTypeId));
  });

  // Pagination
  const totalPages = Math.ceil(_s.total / PAGE_SIZE);
  if (totalPages > 1) {
    _show($('goalsPagination'));
    const start = (_s.page - 1) * PAGE_SIZE + 1;
    const end   = Math.min(_s.page * PAGE_SIZE, _s.total);
    $('goalsPaginationInfo').textContent =
      `${start}–${end} ${t('goals.pagination_of')} ${_s.total}`;
    $('goalsPrevBtn').disabled = _s.page <= 1;
    $('goalsNextBtn').disabled = _s.page >= totalPages;
  } else {
    _hide($('goalsPagination'));
  }
}

/* ── Load data ──────────────────────────────────────────────────────────────── */
async function _loadDashboard() {
  try {
    _s.dashboard = await GoalService.getDashboard();
    if (_s.dashboard?.kpi) _renderKpiStrip(_s.dashboard.kpi);
  } catch { /* dashboard failure is non-critical */ }
}

async function _loadGoalList() {
  try {
    const res = await GoalService.getList({
      statusId:  _s.statusId,
      goalTypeId:_s.typeId,
      priority:  _s.priority,
      pageNumber:_s.page,
      pageSize:  PAGE_SIZE,
    });
    _s.goals  = res.items ?? [];
    _s.total  = res.totalCount ?? 0;
  } catch (err) {
    _s.goals = []; _s.total = 0;
    if (err instanceof ApiError) showError(err.message || t('goals.error'));
    else showError(t('goals.error'));
  }
}

/* ── Page init ──────────────────────────────────────────────────────────────── */
async function _initPage() {
  const [dashRes, listRes] = await Promise.allSettled([
    GoalService.getDashboard(),
    GoalService.getList({ pageNumber: 1, pageSize: PAGE_SIZE }),
  ]);

  if (dashRes.status === 'fulfilled') {
    _s.dashboard = dashRes.value;
  }
  if (listRes.status === 'fulfilled') {
    _s.goals  = listRes.value.items  ?? [];
    _s.total  = listRes.value.totalCount ?? 0;
  }

  _hide($('goalsPageSkeleton'));

  const hasAny = _s.total > 0 || (_s.dashboard?.kpi?.activeGoalCount ?? 0) > 0
                               || (_s.dashboard?.kpi?.completedGoalCount ?? 0) > 0;

  if (!hasAny && _s.goals.length === 0) {
    _show($('goalsNoData'));
    return;
  }

  _show($('goalsContent'));
  if (_s.dashboard?.kpi) _renderKpiStrip(_s.dashboard.kpi);
  _renderGoals();
}

/* ── Wizard ─────────────────────────────────────────────────────────────────── */
function _renderWizardTypeGrid() {
  const grid = $('wizTypeGrid');
  grid.innerHTML = Object.entries(GOAL_TYPE_KEYS).map(([id, key]) => {
    const color = _goalColor(Number(id));
    const icon  = _goalIcon(Number(id));
    return `
      <div class="wizard-type-card" data-type="${id}" tabindex="0" role="button">
        <div class="wizard-type-card-icon" style="background:${color}1a;color:${color}">
          <i class="bi ${icon}"></i>
        </div>
        <div class="wizard-type-card-lbl">${t(`goals.${key}`)}</div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.wizard-type-card').forEach(card => {
    const select = () => {
      grid.querySelectorAll('.wizard-type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      _s.wType = Number(card.dataset.type);
      $('wizNextBtn').disabled = false;
    };
    card.addEventListener('click', select);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') select(); });
  });
}

function _wizSetStep(step) {
  _s.wStep = step;
  [1,2,3,4].forEach(i => {
    const panel = $(`wizStep${i}`);
    const node  = $(`wizNode${i}`);
    const dot   = $(`wizDot${i}`);
    if (panel) panel.classList.toggle('d-none', i !== step);
    if (!node || !dot) return;
    node.classList.remove('active','done');
    if (i < step)  { node.classList.add('done');   dot.innerHTML = '<i class="bi bi-check-lg"></i>'; }
    if (i === step){ node.classList.add('active');  dot.textContent = i; }
    if (i > step)  { dot.textContent = i; }
  });

  _hide($('wizBackBtn'));
  _hide($('wizNextBtn'));
  _hide($('wizCreateBtn'));

  if (step > 1)  _show($('wizBackBtn'));
  if (step < 4)  _show($('wizNextBtn'));
  if (step === 4) _show($('wizCreateBtn'));

  // Button state
  if (step === 1) $('wizNextBtn').disabled = !_s.wType;
  if (step === 2) $('wizNextBtn').disabled = !$('wizName').value.trim();
  if (step === 3) $('wizNextBtn').disabled = !($('wizTargetAmount').value > 0);
  if (step === 4) $('wizCreateBtn').disabled = false;
}

function _openWizard() {
  _s.wStep = 1; _s.wType = null;
  $('wizName').value = '';
  $('wizDesc').value = '';
  $('wizTargetAmount').value = '';
  $('wizInitialAmount').value = '';
  $('wizTargetDate').value = '';
  $('wizPriority').value = '2';
  $('wizTypeGrid').querySelectorAll('.wizard-type-card').forEach(c => c.classList.remove('selected'));
  _wizSetStep(1);
  $('wizNextBtn').disabled = true;
  _wizardModal.show();
}

async function _submitWizard() {
  const btn = $('wizCreateBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('goals.wizard_creating')}`;

  try {
    const payload = {
      name:          $('wizName').value.trim(),
      description:   $('wizDesc').value.trim() || null,
      goalTypeId:    _s.wType,
      targetAmount:  parseFloat($('wizTargetAmount').value),
      initialAmount: parseFloat($('wizInitialAmount').value) || 0,
      targetDate:    $('wizTargetDate').value || null,
      priority:      parseInt($('wizPriority').value, 10),
    };

    await GoalService.create(payload);
    _wizardModal.hide();
    showSuccess(t('goals.created_success'));
    _s.page = 1;
    await _reloadAfterChange();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-check-circle me-2"></i><span>${t('goals.wizard_create')}</span>`;
  }
}

/* ── Contribute / Withdraw / Adjust ─────────────────────────────────────────── */
function _openContribute(goalId) {
  _s.actionGoalId = goalId;
  $('ctbAmount').value = '';
  $('ctbDate').value   = _today();
  $('ctbNotes').value  = '';
  _contributeModal.show();
}

function _openWithdraw(goalId) {
  _s.actionGoalId = goalId;
  $('wthAmount').value = '';
  $('wthDate').value   = _today();
  $('wthNotes').value  = '';
  _withdrawModal.show();
}

function _openAdjust(goalId) {
  _s.actionGoalId = goalId;
  const goal = _s.goals.find(g => g.goalId === goalId);
  $('adjCurrentVal').textContent = goal ? _fmtCurrency(goal.currentAmount) : '—';
  $('adjNewAmount').value = goal ? goal.currentAmount : '';
  $('adjDate').value   = _today();
  $('adjNotes').value  = '';
  _adjustModal.show();
}

async function _submitContribute() {
  const btn = $('ctbSubmitBtn');
  const amount = parseFloat($('ctbAmount').value);
  if (!amount || amount <= 0) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
  try {
    const res = await GoalService.contribute({
      goalId:           _s.actionGoalId,
      amount,
      notes:            $('ctbNotes').value.trim() || null,
      contributionDate: $('ctbDate').value,
    });
    _contributeModal.hide();
    showSuccess(t('goals.contributed_success'));
    if (res.goalCompleted) _showCompletedCelebration(res);
    await _reloadAfterChange();
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
      goalId:           _s.actionGoalId,
      amount,
      notes:            $('wthNotes').value.trim() || null,
      contributionDate: $('wthDate').value,
    });
    _withdrawModal.hide();
    showSuccess(t('goals.withdrawn_success'));
    await _reloadAfterChange();
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
  if (newAmount === undefined || newAmount < 0) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
  try {
    await GoalService.adjust({
      goalId:         _s.actionGoalId,
      newAmount,
      notes:          $('adjNotes').value.trim() || null,
      adjustmentDate: $('adjDate').value,
    });
    _adjustModal.hide();
    showSuccess(t('goals.adjusted_success'));
    await _reloadAfterChange();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('goals.modal_confirm');
  }
}

/* ── Edit goal ──────────────────────────────────────────────────────────────── */
function _openEdit(goalId) {
  const goal = _s.goals.find(g => g.goalId === goalId);
  if (!goal) return;
  _s.actionGoalId = goalId;
  $('editName').value         = goal.name ?? '';
  $('editDesc').value         = goal.description ?? '';
  $('editTargetAmount').value = goal.targetAmount ?? '';
  $('editTargetDate').value   = goal.targetDate ? String(goal.targetDate).split('T')[0] : '';
  $('editPriority').value     = String(goal.priority ?? 2);
  _editModal.show();
}

async function _submitEdit() {
  const btn = $('editSaveBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('goals.edit_saving')}`;
  try {
    await GoalService.update({
      id:           _s.actionGoalId,
      name:         $('editName').value.trim(),
      description:  $('editDesc').value.trim() || null,
      targetAmount: parseFloat($('editTargetAmount').value),
      targetDate:   $('editTargetDate').value || null,
      priority:     parseInt($('editPriority').value, 10),
    });
    _editModal.hide();
    showSuccess(t('goals.updated_success'));
    await _reloadAfterChange();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('goals.edit_save');
  }
}

/* ── Pause / Resume ──────────────────────────────────────────────────────────── */
async function _togglePauseResume(goalId, currentStatus) {
  try {
    if (currentStatus === 2) {
      await GoalService.resume(goalId);
      showSuccess(t('goals.resumed_success'));
    } else {
      await GoalService.pause(goalId);
      showSuccess(t('goals.paused_success'));
    }
    await _reloadAfterChange();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
  }
}

/* ── Delete ─────────────────────────────────────────────────────────────────── */
function _openDelete(goalId) {
  _s.actionGoalId = goalId;
  _deleteModal.show();
}

async function _confirmDelete() {
  const btn = $('deleteConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('goals.deleting')}`;
  try {
    await GoalService.remove(_s.actionGoalId);
    _deleteModal.hide();
    showSuccess(t('goals.deleted_success'));
    _s.page = 1;
    await _reloadAfterChange();
  } catch (err) {
    showError(err instanceof ApiError ? (err.message || t('goals.error')) : t('goals.error'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('goals.delete_confirm_btn');
  }
}

/* ── Celebration ─────────────────────────────────────────────────────────────── */
function _showCompletedCelebration(res) {
  const goal = _s.goals.find(g => g.goalId === _s.actionGoalId);
  const name = goal?.name ?? '';
  $('completedGoalDesc').textContent = t('goals.completed_desc', { name });
  setTimeout(() => _completedModal.show(), 400);
}

/* ── Reload after mutation ───────────────────────────────────────────────────── */
async function _reloadAfterChange() {
  try {
    const [dashRes, listRes] = await Promise.allSettled([
      GoalService.getDashboard(),
      GoalService.getList({
        statusId:  _s.statusId,
        goalTypeId:_s.typeId,
        priority:  _s.priority,
        pageNumber:_s.page,
        pageSize:  PAGE_SIZE,
      }),
    ]);

    if (dashRes.status === 'fulfilled' && dashRes.value?.kpi) {
      _s.dashboard = dashRes.value;
      _renderKpiStrip(dashRes.value.kpi);
    }
    if (listRes.status === 'fulfilled') {
      _s.goals = listRes.value.items  ?? [];
      _s.total = listRes.value.totalCount ?? 0;
    }

    // Check if no goals at all to show empty state
    const hasAny = _s.total > 0 ||
      (_s.dashboard?.kpi?.completedGoalCount ?? 0) > 0 ||
      (_s.dashboard?.kpi?.pausedGoalCount    ?? 0) > 0;

    if (!hasAny) {
      _hide($('goalsContent'));
      _show($('goalsNoData'));
    } else {
      _hide($('goalsNoData'));
      _show($('goalsContent'));
      _renderGoals();
    }
  } catch { /* non-critical */ }
}

/* ── Event delegation ────────────────────────────────────────────────────────── */
function _bindGridEvents() {
  const grid = $('goalsGrid');
  grid.addEventListener('click', e => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const id = Number(btn.dataset.id);

    if (btn.classList.contains('goal-action-contribute') || btn.classList.contains('goal-action-contribute-btn'))
      _openContribute(id);
    else if (btn.classList.contains('goal-action-withdraw'))
      _openWithdraw(id);
    else if (btn.classList.contains('goal-action-adjust'))
      _openAdjust(id);
    else if (btn.classList.contains('goal-action-edit'))
      _openEdit(id);
    else if (btn.classList.contains('goal-action-pause-resume'))
      _togglePauseResume(id, Number(btn.dataset.status));
    else if (btn.classList.contains('goal-action-delete'))
      _openDelete(id);
  });
}

/* ── Main ────────────────────────────────────────────────────────────────────── */
(async () => {
  await initI18n();
  await guardPage();
  initLayout();
  await initWorkspaceContext({
    viewPerm:  'view_goals',
    contentId: 'goalsContent',
    gates: [
      { id: 'addGoalBtn',      perm: 'create_goal' },
      { id: 'addGoalBtnEmpty', perm: 'create_goal' },
    ],
  });

  // Bootstrap modal instances
  _wizardModal     = new bootstrap.Modal($('goalWizardModal'));
  _contributeModal = new bootstrap.Modal($('contributeModal'));
  _withdrawModal   = new bootstrap.Modal($('withdrawModal'));
  _adjustModal     = new bootstrap.Modal($('adjustModal'));
  _editModal       = new bootstrap.Modal($('editGoalModal'));
  _deleteModal     = new bootstrap.Modal($('deleteGoalModal'));
  _completedModal  = new bootstrap.Modal($('goalCompletedModal'));

  // Build wizard type grid once
  _renderWizardTypeGrid();

  // Load data
  await _initPage();

  // Bind events
  _bindGridEvents();

  $('addGoalBtn')?.addEventListener('click', _openWizard);
  $('addGoalBtnEmpty')?.addEventListener('click', _openWizard);

  // Wizard navigation
  $('wizNextBtn').addEventListener('click', () => {
    if (_s.wStep < 4) _wizSetStep(_s.wStep + 1);
  });
  $('wizBackBtn').addEventListener('click', () => {
    if (_s.wStep > 1) _wizSetStep(_s.wStep - 1);
  });
  $('wizCreateBtn').addEventListener('click', _submitWizard);

  // Wizard inline validation
  $('wizName').addEventListener('input', () => {
    if (_s.wStep === 2) $('wizNextBtn').disabled = !$('wizName').value.trim();
  });
  $('wizTargetAmount').addEventListener('input', () => {
    if (_s.wStep === 3) $('wizNextBtn').disabled = !($('wizTargetAmount').value > 0);
  });

  // Action modals
  $('ctbSubmitBtn').addEventListener('click', _submitContribute);
  $('wthSubmitBtn').addEventListener('click', _submitWithdraw);
  $('adjSubmitBtn').addEventListener('click', _submitAdjust);
  $('editSaveBtn').addEventListener('click', _submitEdit);
  $('deleteConfirmBtn').addEventListener('click', _confirmDelete);

  // Filters
  const onFilterChange = async () => {
    _s.statusId = $('filterStatus').value   ? Number($('filterStatus').value)   : null;
    _s.typeId   = $('filterType').value     ? Number($('filterType').value)     : null;
    _s.priority = $('filterPriority').value ? Number($('filterPriority').value) : null;
    _s.page     = 1;
    await _loadGoalList();
    _renderGoals();
  };
  $('filterStatus').addEventListener('change', onFilterChange);
  $('filterType').addEventListener('change', onFilterChange);
  $('filterPriority').addEventListener('change', onFilterChange);

  // Pagination
  $('goalsPrevBtn').addEventListener('click', async () => {
    if (_s.page > 1) { _s.page--; await _loadGoalList(); _renderGoals(); }
  });
  $('goalsNextBtn').addEventListener('click', async () => {
    if (_s.page * PAGE_SIZE < _s.total) { _s.page++; await _loadGoalList(); _renderGoals(); }
  });

    document.addEventListener('mm-currency-change', () => {
    /* Re-fetch so amounts are converted by the backend for the new
       display currency (re-rendering cached data would mis-label them). */
    if (_s.dashboard) _reloadAfterChange();
  });
})();
