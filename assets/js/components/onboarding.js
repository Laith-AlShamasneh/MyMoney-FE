/**
 * components/onboarding.js — MyMoney
 * First-time user onboarding tour engine.
 *
 * Smart page detection:
 *   - On the current step's page  → shows a floating Tooltip Bubble + dim overlay
 *   - On any other dashboard page → shows a subtle Resume Pill
 *
 * Design principles:
 *   - overlay is pointer-events: none so the page stays fully interactive
 *   - localStorage caches state (1-minute freshness) to avoid redundant API calls
 *   - CSS loaded dynamically — zero overhead for users who have completed onboarding
 *   - Non-critical: every error is silently swallowed so page function is never broken
 */

import { Config }          from '../core/config.js';
import { get, post }       from '../core/api.js';
import { getCurrentUser, updateCurrentUser } from '../core/auth.js';
import { t, getLanguage }  from '../core/i18n.js';

/* --------------------------------------------------------------------------
   Module state
   -------------------------------------------------------------------------- */
let _state     = null;   // Full OnboardingStateResponse from API
let _cssLoaded = false;

/* --------------------------------------------------------------------------
   CSS loader (called only once, only when needed)
   -------------------------------------------------------------------------- */
function _loadCss() {
  if (_cssLoaded) return;
  if (!document.getElementById('mm-onboarding-stylesheet')) {
    const link = document.createElement('link');
    link.id   = 'mm-onboarding-stylesheet';
    link.rel  = 'stylesheet';
    link.href = '/assets/css/onboarding.css';
    document.head.appendChild(link);
  }
  _cssLoaded = true;
}

/* --------------------------------------------------------------------------
   localStorage cache (1-minute freshness for "still active" fast path)
   -------------------------------------------------------------------------- */
function _saveCache(state) {
  try {
    localStorage.setItem(Config.STORAGE_KEYS.ONBOARDING, JSON.stringify({
      currentStepKey: state.currentStepKey,
      status:         state.status,
      syncedAt:       Date.now(),
    }));
  } catch { /* ignore */ }
}

function _loadCache() {
  try {
    const raw = localStorage.getItem(Config.STORAGE_KEYS.ONBOARDING);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (Date.now() - (cache.syncedAt || 0) > 60_000) return null;
    return cache;
  } catch {
    return null;
  }
}

function _clearCache() {
  try { localStorage.removeItem(Config.STORAGE_KEYS.ONBOARDING); } catch { /* ignore */ }
}

/* --------------------------------------------------------------------------
   Current page path (normalised, no trailing slash)
   -------------------------------------------------------------------------- */
function _pagePath() {
  return window.location.pathname.replace(/\/$/, '') || '/';
}

/* --------------------------------------------------------------------------
   Public entry point
   Designed to be fire-and-forget: page scripts call initOnboarding() once
   after data loads; any failure is silently swallowed.
   -------------------------------------------------------------------------- */
export async function initOnboarding() {
  try {
    const user = getCurrentUser();
    if (!user) return;
    if (user.hasCompletedOnboarding) return;

    // Fast-path: check localStorage before hitting the API
    const cache = _loadCache();
    if (cache && (cache.status === 1 || cache.status === 3)) {
      // Mark complete in memory so subsequent pages skip immediately
      updateCurrentUser({ hasCompletedOnboarding: true });
      return;
    }

    const result = await get(Config.API.ONBOARDING.STATE);
    if (!result) return;

    _state = result;
    _saveCache(_state);

    if (_state.status === 1 || _state.status === 3) {
      updateCurrentUser({ hasCompletedOnboarding: true });
      return;
    }

    _loadCss();
    // Small delay so skeletons have resolved and the DOM is settled
    setTimeout(_render, 600);
  } catch {
    /* Non-critical — silently skip onboarding on any error */
  }
}

/* --------------------------------------------------------------------------
   Render dispatcher
   -------------------------------------------------------------------------- */
function _render() {
  _removeAll();
  if (!_state) return;

  const currentStep = _state.steps.find(s => s.stepKey === _state.currentStepKey);
  if (!currentStep) return;

  const thisPage = _pagePath();
  const stepPage = currentStep.pagePath.replace(/\/$/, '');

  if (thisPage === stepPage || thisPage.endsWith(stepPage)) {
    _showBubble(currentStep);
  } else {
    _showResumePill(currentStep);
  }
}

/* --------------------------------------------------------------------------
   Resume Pill
   -------------------------------------------------------------------------- */
function _showResumePill(step) {
  const isAr   = getLanguage() === 'ar';
  const num    = step.sortOrder;
  const total  = _state.steps.length;

  const pill     = document.createElement('div');
  pill.id        = 'mm-onboarding-pill';
  pill.setAttribute('role', 'status');
  pill.setAttribute('aria-live', 'polite');

  const label   = isAr ? `▶ متابعة الإعداد (${num}/${total})` : `▶ Continue Setup (Step ${num}/${total})`;
  const goLabel = isAr ? '← انتقل' : 'Go →';
  const dismiss = isAr ? 'إغلاق' : 'Dismiss';

  pill.innerHTML = `
    <span class="mm-onboarding-pill-text">${label}</span>
    <a class="mm-onboarding-pill-link" href="${step.pagePath}">${goLabel}</a>
    <button class="mm-onboarding-pill-dismiss" aria-label="${dismiss}">
      <i class="bi bi-x" aria-hidden="true"></i>
    </button>
  `;

  pill.querySelector('.mm-onboarding-pill-dismiss').addEventListener('click', () => pill.remove());

  const anchor = document.querySelector('.mm-content') || document.querySelector('main') || document.body;
  anchor.insertAdjacentElement('afterbegin', pill);
}

/* --------------------------------------------------------------------------
   Tooltip Bubble + overlay
   -------------------------------------------------------------------------- */
function _showBubble(step) {
  const isAr  = getLanguage() === 'ar';
  const num   = step.sortOrder;
  const total = _state.steps.length;

  // Overlay (pointer-events: none — page stays interactive)
  const overlay    = document.createElement('div');
  overlay.id       = 'mm-onboarding-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  // Progress dots
  const dots = _state.steps.map(s => {
    const active = s.stepKey === _state.currentStepKey;
    const done   = s.stepStatus === 2 || s.stepStatus === 3;
    const cls    = active ? 'mm-dot mm-dot-active' : done ? 'mm-dot mm-dot-done' : 'mm-dot';
    return `<span class="${cls}" aria-hidden="true"></span>`;
  }).join('');

  const title = t(`onboarding.steps.${step.stepKey}.title`);
  const desc  = t(`onboarding.steps.${step.stepKey}.desc`);

  const isLast   = num >= total;
  const nextLabel = isLast
    ? (isAr ? 'إنهاء الإعداد ✓' : 'Finish Setup ✓')
    : (isAr ? 'التالي ←' : 'Next →');

  const skipStepHtml = step.canSkip
    ? `<button class="mm-onboarding-skip-step btn btn-link btn-sm">${isAr ? 'تخطى هذه الخطوة' : 'Skip this step'}</button>`
    : '';

  const skipAllHtml = `<button class="mm-onboarding-skip-all btn btn-link btn-sm">${isAr ? 'تخطى الإعداد كاملاً' : 'Skip entire setup'}</button>`;

  // Bubble
  const bubble    = document.createElement('div');
  bubble.id       = 'mm-onboarding-bubble';
  bubble.setAttribute('role', 'dialog');
  bubble.setAttribute('aria-modal', 'false');
  bubble.setAttribute('aria-labelledby', 'mm-ob-title');
  bubble.setAttribute('tabindex', '-1');

  bubble.innerHTML = `
    <div class="mm-onboarding-bubble-header">
      <div class="mm-onboarding-progress-dots">${dots}</div>
      <span class="mm-onboarding-step-counter">${num} / ${total}</span>
    </div>
    <h2 class="mm-onboarding-step-title" id="mm-ob-title">${title}</h2>
    <p class="mm-onboarding-step-desc">${desc}</p>
    <div class="mm-onboarding-bubble-footer">
      <div class="mm-onboarding-bubble-skip-links">
        ${skipStepHtml}
        ${skipAllHtml}
      </div>
      <button class="mm-onboarding-next btn btn-primary btn-sm">${nextLabel}</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(bubble);
  bubble.focus();

  // Wire events
  bubble.querySelector('.mm-onboarding-next')
    .addEventListener('click', () => _handleAdvance(step, false));

  if (step.canSkip) {
    bubble.querySelector('.mm-onboarding-skip-step')
      ?.addEventListener('click', () => _handleAdvance(step, true));
  }

  bubble.querySelector('.mm-onboarding-skip-all')
    .addEventListener('click', _handleSkipAll);
}

/* --------------------------------------------------------------------------
   Event handlers
   -------------------------------------------------------------------------- */
async function _handleAdvance(step, isSkip) {
  _removeAll();
  try {
    await post(Config.API.ONBOARDING.ADVANCE, { stepKey: step.stepKey, isSkip });
    _clearCache();
    await _refreshAndRender();
  } catch { /* silent */ }
}

async function _handleSkipAll() {
  _removeAll();
  try {
    await post(Config.API.ONBOARDING.SKIP, {});
    _clearCache();
    updateCurrentUser({ hasCompletedOnboarding: true });
    _showSkipToast();
  } catch { /* silent */ }
}

async function _refreshAndRender() {
  try {
    const result = await get(Config.API.ONBOARDING.STATE);
    if (!result) return;

    _state = result;
    _saveCache(_state);

    if (_state.status === 1) {
      updateCurrentUser({ hasCompletedOnboarding: true });
      _showCompletionModal();
      return;
    }

    if (_state.status === 3) {
      updateCurrentUser({ hasCompletedOnboarding: true });
      return;
    }

    _render();
  } catch { /* silent */ }
}

/* --------------------------------------------------------------------------
   Completion modal
   -------------------------------------------------------------------------- */
function _showCompletionModal() {
  const isAr  = getLanguage() === 'ar';
  const modal = document.createElement('div');
  modal.id    = 'mm-onboarding-complete';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'mm-ob-complete-title');

  const title = t('onboarding.complete.title');
  const desc  = t('onboarding.complete.desc');
  const cta   = t('onboarding.complete.cta');

  modal.innerHTML = `
    <div class="mm-onboarding-complete-card">
      <div class="mm-onboarding-confetti"><span></span></div>
      <div class="mm-onboarding-complete-icon">
        <i class="bi bi-patch-check-fill" aria-hidden="true"></i>
      </div>
      <h2 class="mm-onboarding-complete-title" id="mm-ob-complete-title">${title}</h2>
      <p class="mm-onboarding-complete-desc">${desc}</p>
      <button class="btn btn-primary mm-onboarding-complete-btn">${cta}</button>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.mm-onboarding-complete-btn')
    .addEventListener('click', () => modal.remove());
}

/* --------------------------------------------------------------------------
   Skip toast
   -------------------------------------------------------------------------- */
function _showSkipToast() {
  const isAr = getLanguage() === 'ar';
  const msg  = isAr
    ? 'تم تخطى الإعداد. يمكنك إعادته لاحقاً من الإعدادات.'
    : 'Setup skipped. You can restart it anytime from Settings.';

  import('./toast.js')
    .then(({ showSuccess }) => showSuccess(msg))
    .catch(() => { /* toast unavailable */ });
}

/* --------------------------------------------------------------------------
   Cleanup
   -------------------------------------------------------------------------- */
function _removeAll() {
  document.getElementById('mm-onboarding-overlay')?.remove();
  document.getElementById('mm-onboarding-bubble')?.remove();
  document.getElementById('mm-onboarding-pill')?.remove();
}
