/**
 * pages/settings.js — MyMoney
 * Settings page: change password link, email change, active sessions management.
 */

import { initI18n, t, getLanguage }        from '../core/i18n.js';
import { initLayout }                      from '../components/layout.js';
import { guardPage, clearSession }         from '../core/auth.js';
import { initOnboarding }                 from '../components/onboarding.js';
import { ProfileService }                  from '../services/profile-service.js';
import { AuthService }                     from '../services/auth-service.js';
import { NotificationService }             from '../services/notification-service.js';
import { ApiError }                        from '../core/api.js';
import { Config }                          from '../core/config.js';
import { Loader }                          from '../components/loading.js';
import { showSuccess, showError }          from '../components/toast.js';
import { CurrencyService }                from '../services/currency-service.js';

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
/** @type {Array<{id:number, ipAddress:string, createdOnUtc:string, expiresOnUtc:string, isCurrentSession:boolean}>} */
let _sessions = [];

/** @type {{email:string, isEmailConfirmed:boolean, hasPendingEmailChange:boolean, pendingEmail:string|null}|null} */
let _emailState = null;

/* --------------------------------------------------------------------------
   DOM refs — email change
   -------------------------------------------------------------------------- */
const emailSkeleton        = document.getElementById('emailSkeleton');
const emailDisplayWrap     = document.getElementById('emailDisplay');
const currentEmailValue    = document.getElementById('currentEmailValue');
const emailVerifiedBadge   = document.getElementById('emailVerifiedBadge');
const emailUnverifiedBadge = document.getElementById('emailUnverifiedBadge');
const pendingEmailSection  = document.getElementById('pendingEmailSection');
const pendingEmailAddress  = document.getElementById('pendingEmailAddress');
const cancelEmailChangeBtn = document.getElementById('cancelEmailChangeBtn');
const changeEmailFormWrap  = document.getElementById('changeEmailFormWrap');
const changeEmailBtnWrap   = document.getElementById('changeEmailBtnWrap');
const showChangeEmailFormBtn = document.getElementById('showChangeEmailFormBtn');
const changeEmailForm      = document.getElementById('changeEmailForm');
const newEmailInput        = document.getElementById('newEmailInput');
const emailChangePwdInput  = document.getElementById('emailChangePwdInput');
const submitEmailChangeBtn = document.getElementById('submitEmailChangeBtn');
const cancelEmailFormBtn   = document.getElementById('cancelEmailFormBtn');
const emailFormError        = document.getElementById('emailFormError');
const emailFormErrList      = document.getElementById('emailFormErrorList');
const resendVerificationBtn = document.getElementById('resendVerificationBtn');

/* --------------------------------------------------------------------------
   DOM refs — sessions
   -------------------------------------------------------------------------- */
const sessionsLoading   = document.getElementById('sessionsLoading');
const sessionsError     = document.getElementById('sessionsError');
const sessionsErrorMsg  = document.getElementById('sessionsErrorMsg');
const sessionsList      = document.getElementById('sessionsList');
const sessionsEmpty     = document.getElementById('sessionsEmpty');
const sessionsContainer = document.getElementById('sessionsContainer');
const revokeOthersWrap  = document.getElementById('revokeOthersWrap');
const revokeOthersBtn   = document.getElementById('revokeOthersBtn');

/* --------------------------------------------------------------------------
   DOM refs — currency preferences
   -------------------------------------------------------------------------- */
const currencyPrefsLoading  = document.getElementById('currencyPrefsLoading');
const currencyPrefsError    = document.getElementById('currencyPrefsError');
const currencyPrefsErrorMsg = document.getElementById('currencyPrefsErrorMsg');
const currencyPrefsForm     = document.getElementById('currencyPrefsForm');
const baseCurrencySelect    = document.getElementById('baseCurrencySelect');
const displayCurrencySelect = document.getElementById('displayCurrencySelect');
const numberFormatSelect    = document.getElementById('numberFormatSelect');
const symbolStyleSelect     = document.getElementById('symbolStyleSelect');
const negativeFormatSelect  = document.getElementById('negativeFormatSelect');
const currencyPositionSelect= document.getElementById('currencyPositionSelect');
const saveCurrencyPrefsBtn  = document.getElementById('saveCurrencyPrefsBtn');
const currencySaveSpinner   = document.getElementById('currencySaveSpinner');

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function _esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function _formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const lang = getLanguage() === 'ar' ? 'ar-SA' : 'en-US';
    return new Intl.DateTimeFormat(lang, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString.replace('T', ' ').slice(0, 16);
  }
}

/* --------------------------------------------------------------------------
   Render sessions
   -------------------------------------------------------------------------- */
function _buildSessionHtml(s) {
  const currentBadge = s.isCurrentSession
    ? `<span class="badge bg-primary ms-2" data-i18n="settings.sessions_current">${t('settings.sessions_current')}</span>`
    : '';

  const revokeBtn = s.isCurrentSession
    ? `<button type="button"
               class="btn btn-sm btn-outline-warning ms-auto flex-shrink-0"
               data-revoke-id="${s.id}"
               data-is-current="true"
               aria-label="${_esc(t('settings.sessions_sign_out_this'))}">
         <i class="bi bi-box-arrow-right me-1" aria-hidden="true"></i>
         <span>${_esc(t('settings.sessions_sign_out_this'))}</span>
       </button>`
    : `<button type="button"
               class="btn btn-sm btn-outline-danger ms-auto flex-shrink-0"
               data-revoke-id="${s.id}"
               aria-label="${_esc(t('settings.sessions_revoke'))}">
         <i class="bi bi-x-circle me-1" aria-hidden="true"></i>
         <span>${_esc(t('settings.sessions_revoke'))}</span>
       </button>`;

  return `
    <div class="d-flex align-items-start gap-3 py-3 border-bottom session-item" data-session-id="${s.id}">
      <i class="bi bi-display text-muted mt-1 flex-shrink-0 fs-5" aria-hidden="true"></i>
      <div class="flex-grow-1 small">
        <div class="d-flex align-items-center flex-wrap gap-1 mb-1">
          <span class="fw-semibold" dir="ltr">${_esc(s.ipAddress)}</span>
          ${currentBadge}
        </div>
        <div class="text-muted">
          <span>${_esc(t('settings.sessions_started'))}:</span>
          <span>${_esc(_formatDateTime(s.createdOnUtc))}</span>
        </div>
        <div class="text-muted">
          <span>${_esc(t('settings.sessions_expires'))}:</span>
          <span>${_esc(_formatDateTime(s.expiresOnUtc))}</span>
        </div>
      </div>
      ${revokeBtn}
    </div>`;
}

function _renderSessions(sessions) {
  if (!sessions.length) {
    sessionsList.classList.add('d-none');
    sessionsEmpty.classList.remove('d-none');
    return;
  }

  sessionsEmpty.classList.add('d-none');

  /* Sort: current session first, then most recent */
  const sorted = [...sessions].sort((a, b) => {
    if (a.isCurrentSession) return -1;
    if (b.isCurrentSession) return 1;
    return new Date(b.createdOnUtc) - new Date(a.createdOnUtc);
  });

  sessionsContainer.innerHTML = sorted.map(_buildSessionHtml).join('');
  sessionsList.classList.remove('d-none');

  /* Show "revoke others" only when there are non-current sessions */
  const hasOthers = sessions.some(s => !s.isCurrentSession);
  revokeOthersWrap.classList.toggle('d-none', !hasOthers);

  /* Bind revoke buttons */
  sessionsContainer.querySelectorAll('[data-revoke-id]').forEach(btn => {
    btn.addEventListener('click', () => _revokeSession(
      Number(btn.dataset.revokeId),
      btn,
      btn.dataset.isCurrent === 'true',
    ));
  });
}

/* --------------------------------------------------------------------------
   Load sessions
   -------------------------------------------------------------------------- */
async function loadSessions() {
  const refreshToken = _getRefreshToken();

  sessionsLoading.classList.remove('d-none');
  sessionsError.classList.add('d-none');
  sessionsList.classList.add('d-none');
  sessionsEmpty.classList.add('d-none');

  try {
    _sessions = await ProfileService.getSessions(refreshToken) || [];
    sessionsLoading.classList.add('d-none');
    _renderSessions(_sessions);
  } catch (err) {
    sessionsLoading.classList.add('d-none');
    sessionsErrorMsg.textContent = err instanceof ApiError
      ? err.message
      : t('errors.unknown');
    sessionsError.classList.remove('d-none');
  }
}

/* --------------------------------------------------------------------------
   Revoke a single session
   -------------------------------------------------------------------------- */
async function _revokeSession(sessionId, btn, isCurrentSession = false) {
  const confirmKey = isCurrentSession
    ? 'settings.sessions_sign_out_confirm'
    : 'settings.sessions_revoke_confirm';
  if (!window.confirm(t(confirmKey))) return;

  Loader.setButtonLoading(btn);
  try {
    await ProfileService.revokeSession(sessionId);

    if (isCurrentSession) {
      /* Current session revoked — clear all auth state and redirect to login */
      try { sessionStorage.setItem('mm.login_notice', 'session_ended'); } catch { /* ignore */ }
      clearSession();
      window.location.href = Config.ROUTES.LOGIN;
    } else {
      _sessions = _sessions.filter(s => s.id !== sessionId);
      _renderSessions(_sessions);
      showSuccess(t('settings.sessions_revoke_success'));
    }
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
    Loader.clearButtonLoading(btn);
  }
}

/* --------------------------------------------------------------------------
   Revoke all other sessions
   -------------------------------------------------------------------------- */
revokeOthersBtn.addEventListener('click', async () => {
  if (!window.confirm(t('settings.sessions_revoke_others_confirm'))) return;

  const refreshToken = _getRefreshToken();
  if (!refreshToken) {
    showError(t('errors.session_expired'));
    return;
  }

  Loader.setButtonLoading(revokeOthersBtn);
  try {
    await ProfileService.revokeAllOtherSessions(refreshToken);
    /* Keep only current session in state */
    _sessions = _sessions.filter(s => s.isCurrentSession);
    _renderSessions(_sessions);
    showSuccess(t('settings.sessions_revoke_others_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(revokeOthersBtn);
  }
});

/* --------------------------------------------------------------------------
   Email change — render + handlers
   -------------------------------------------------------------------------- */
function _renderEmailSection(state) {
  currentEmailValue.textContent = state.email || '';

  if (state.isEmailConfirmed) {
    emailVerifiedBadge.classList.remove('d-none');
    emailUnverifiedBadge.classList.add('d-none');
    resendVerificationBtn.classList.add('d-none');
  } else {
    emailVerifiedBadge.classList.add('d-none');
    emailUnverifiedBadge.classList.remove('d-none');
    resendVerificationBtn.classList.remove('d-none');
  }

  if (state.hasPendingEmailChange && state.pendingEmail) {
    pendingEmailAddress.textContent = state.pendingEmail;
    pendingEmailSection.classList.remove('d-none');
    changeEmailBtnWrap.classList.add('d-none');
    changeEmailFormWrap.classList.add('d-none');
  } else {
    pendingEmailSection.classList.add('d-none');
    changeEmailFormWrap.classList.add('d-none');
    changeEmailBtnWrap.classList.remove('d-none');
  }

  emailSkeleton.classList.add('d-none');
  emailDisplayWrap.classList.remove('d-none');
}

function _showEmailErrors(messages) {
  emailFormErrList.innerHTML = messages.map(m => `<li>${_esc(m)}</li>`).join('');
  emailFormError.classList.remove('d-none');
}

function _hideEmailErrors() {
  emailFormError.classList.add('d-none');
  emailFormErrList.innerHTML = '';
}

showChangeEmailFormBtn.addEventListener('click', () => {
  changeEmailBtnWrap.classList.add('d-none');
  changeEmailFormWrap.classList.remove('d-none');
  _hideEmailErrors();
  changeEmailForm.classList.remove('was-validated');
  newEmailInput.value = '';
  emailChangePwdInput.value = '';
  newEmailInput.focus();
});

cancelEmailFormBtn.addEventListener('click', () => {
  changeEmailFormWrap.classList.add('d-none');
  changeEmailBtnWrap.classList.remove('d-none');
  _hideEmailErrors();
});

changeEmailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  _hideEmailErrors();

  if (!changeEmailForm.checkValidity()) {
    changeEmailForm.classList.add('was-validated');
    return;
  }
  changeEmailForm.classList.remove('was-validated');

  Loader.setButtonLoading(submitEmailChangeBtn);
  try {
    await AuthService.requestEmailChange(
      newEmailInput.value.trim(),
      emailChangePwdInput.value,
    );

    if (_emailState) {
      _emailState.hasPendingEmailChange = true;
      _emailState.pendingEmail = newEmailInput.value.trim();
      _renderEmailSection(_emailState);
    }
    showSuccess(t('profile.email_change_success'));
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.errors?.length) _showEmailErrors(err.errors);
      else _showEmailErrors([err.message || t('errors.unknown')]);
    }
  } finally {
    Loader.clearButtonLoading(submitEmailChangeBtn);
  }
});

cancelEmailChangeBtn.addEventListener('click', async () => {
  if (!window.confirm(t('profile.email_pending_cancel_confirm'))) return;
  Loader.setButtonLoading(cancelEmailChangeBtn);
  try {
    await AuthService.cancelEmailChange();
    if (_emailState) {
      _emailState.hasPendingEmailChange = false;
      _emailState.pendingEmail = null;
      _renderEmailSection(_emailState);
    }
    showSuccess(t('profile.email_pending_cancel_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(cancelEmailChangeBtn);
  }
});

resendVerificationBtn.addEventListener('click', async () => {
  if (!_emailState?.email) return;
  Loader.setButtonLoading(resendVerificationBtn);
  try {
    await AuthService.resendConfirmationEmail(_emailState.email);
    showSuccess(t('profile.resend_verification_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(resendVerificationBtn);
  }
});

async function loadEmailState() {
  try {
    const profile = await ProfileService.getProfile();
    _emailState = {
      email:                profile.email,
      isEmailConfirmed:     profile.isEmailConfirmed,
      hasPendingEmailChange: profile.hasPendingEmailChange,
      pendingEmail:         profile.pendingEmail ?? null,
    };
    _renderEmailSection(_emailState);
  } catch {
    emailSkeleton.classList.add('d-none');
  }
}

/* --------------------------------------------------------------------------
   Auth helpers
   -------------------------------------------------------------------------- */
function _getRefreshToken() {
  try {
    return localStorage.getItem(Config.STORAGE_KEYS.REFRESH_TOKEN);
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------
   Notification preferences
   -------------------------------------------------------------------------- */
const prefsLoading  = document.getElementById('prefsLoading');
const prefsList     = document.getElementById('prefsList');
const prefsError    = document.getElementById('prefsError');
const prefsErrorMsg = document.getElementById('prefsErrorMsg');

const prefToggles = {
  security:  document.getElementById('prefSecurity'),
  financial: document.getElementById('prefFinancial'),
  system:    document.getElementById('prefSystem'),
  reports:   document.getElementById('prefReports'),
  profile:   document.getElementById('prefProfile'),
};

async function loadNotificationPrefs() {
  try {
    const prefs = await NotificationService.getPreferences();
    if (prefToggles.security)  prefToggles.security.checked  = prefs.securityEnabled  ?? true;
    if (prefToggles.financial) prefToggles.financial.checked = prefs.financialEnabled ?? true;
    if (prefToggles.system)    prefToggles.system.checked    = prefs.systemEnabled    ?? true;
    if (prefToggles.reports)   prefToggles.reports.checked   = prefs.reportsEnabled   ?? true;
    if (prefToggles.profile)   prefToggles.profile.checked   = prefs.profileEnabled   ?? true;

    prefsLoading?.classList.add('d-none');
    prefsList?.classList.remove('d-none');
  } catch {
    prefsLoading?.classList.add('d-none');
    prefsError?.classList.remove('d-none');
    if (prefsErrorMsg) prefsErrorMsg.textContent = t('errors.unknown');
  }
}

async function _savePref(key) {
  const toggle = prefToggles[key];
  if (!toggle) return;
  const prev = !toggle.checked;
  try {
    await NotificationService.updatePreferences({
      securityEnabled:  prefToggles.security?.checked  ?? true,
      financialEnabled: prefToggles.financial?.checked ?? true,
      systemEnabled:    prefToggles.system?.checked    ?? true,
      reportsEnabled:   prefToggles.reports?.checked   ?? true,
      profileEnabled:   prefToggles.profile?.checked   ?? true,
    });
    showSuccess(t('notifications.prefs_saved'));
  } catch {
    toggle.checked = prev;
    showError(t('errors.unknown'));
  }
}

function wirePrefsToggles() {
  Object.entries(prefToggles).forEach(([key, toggle]) => {
    toggle?.addEventListener('change', () => _savePref(key));
  });
}

/* --------------------------------------------------------------------------
   Currency preferences
   -------------------------------------------------------------------------- */
function _populateCurrencySelect(el, currencies, selectedCode) {
  el.innerHTML = currencies.map(c =>
    `<option value="${_esc(c.isoCode)}"${c.isoCode === selectedCode ? ' selected' : ''}>
       ${_esc(c.isoCode)} — ${_esc(c.name)}
     </option>`
  ).join('');
}

async function loadCurrencyPrefs() {
  try {
    const [currencies, prefs] = await Promise.all([
      CurrencyService.getCurrencies(),
      CurrencyService.getUserPreferences(),
    ]);

    _populateCurrencySelect(baseCurrencySelect,    currencies, prefs?.baseCurrencyCode    ?? 'USD');
    _populateCurrencySelect(displayCurrencySelect, currencies, prefs?.displayCurrencyCode ?? 'USD');

    numberFormatSelect.value    = String(prefs?.numberFormatId     ?? 1);
    symbolStyleSelect.value     = String(prefs?.symbolStyleId      ?? 1);
    negativeFormatSelect.value  = String(prefs?.negativeFormatId   ?? 1);
    currencyPositionSelect.value= String(prefs?.currencyPositionId ?? 1);

    currencyPrefsLoading.classList.add('d-none');
    currencyPrefsForm.classList.remove('d-none');
  } catch (err) {
    currencyPrefsLoading.classList.add('d-none');
    currencyPrefsErrorMsg.textContent = err instanceof ApiError ? err.message : t('errors.unknown');
    currencyPrefsError.classList.remove('d-none');
  }
}

function _wireCurrencyPrefsForm() {
  currencyPrefsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveCurrencyPrefsBtn.disabled = true;
    currencySaveSpinner.classList.remove('d-none');
    try {
      await CurrencyService.updateUserPreferences({
        baseCurrencyCode:   baseCurrencySelect.value,
        displayCurrencyCode:displayCurrencySelect.value,
        numberFormatId:     parseInt(numberFormatSelect.value, 10),
        symbolStyleId:      parseInt(symbolStyleSelect.value, 10),
        negativeFormatId:   parseInt(negativeFormatSelect.value, 10),
        currencyPositionId: parseInt(currencyPositionSelect.value, 10),
      });
      showSuccess(t('settings.currency_save_success'));
      document.dispatchEvent(new CustomEvent('mm-currency-change'));
    } catch (err) {
      showError(err instanceof ApiError ? err.message : t('errors.unknown'));
    } finally {
      saveCurrencyPrefsBtn.disabled = false;
      currencySaveSpinner.classList.add('d-none');
    }
  });
}

async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  wirePrefsToggles();
  _wireCurrencyPrefsForm();
  await Promise.all([loadEmailState(), loadSessions(), loadNotificationPrefs(), loadCurrencyPrefs()]);
  initOnboarding();
}

init();
