/**
 * pages/login.js — MyMoney
 * Login form: validation, API, session init, all backend error scenarios.
 */

import { initI18n, t }   from '../core/i18n.js';
import { initTheme, initLangSwitcher } from '../components/layout.js';
import { guardAnonymous, setSession } from '../core/auth.js';
import { AuthService }   from '../services/auth-service.js';
import { ApiError }      from '../core/api.js';
import { Loader }        from '../components/loading.js';

/* --------------------------------------------------------------------------
   DOM refs (resolved after DOMContentLoaded — module scripts defer by default)
   -------------------------------------------------------------------------- */
const form          = document.getElementById('loginForm');
const emailInput    = document.getElementById('loginEmail');
const passwordInput = document.getElementById('loginPassword');
const submitBtn     = document.getElementById('loginBtn');
const errorSummary  = document.getElementById('formErrorSummary');
const errorList     = document.getElementById('formErrorList');

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function _esc(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function showErrors(messages) {
  errorList.innerHTML = messages.map(m => `<li>${_esc(m)}</li>`).join('');
  errorSummary.classList.remove('d-none');
  errorSummary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideErrors() {
  errorSummary.classList.add('d-none');
  errorList.innerHTML = '';
}

/* --------------------------------------------------------------------------
   Resend confirmation shortcut — shown when backend says email not confirmed
   -------------------------------------------------------------------------- */
let _resendContainer = null;

function _showResendOption(email) {
  if (_resendContainer) return;
  _resendContainer = document.createElement('div');
  _resendContainer.className = 'text-center mt-2';
  _resendContainer.innerHTML =
    `<button type="button" class="btn btn-link btn-sm p-0" id="resendConfirmBtn">` +
    `${_esc(t('auth.login.resend_confirmation'))}</button>`;
  errorSummary.after(_resendContainer);

  document.getElementById('resendConfirmBtn').addEventListener('click', async function () {
    this.disabled = true;
    this.textContent = t('common.loading');
    try {
      await AuthService.resendConfirmationEmail(email);
      this.textContent = t('auth.confirm_email.resend_success_title');
    } catch {
      this.disabled = false;
      this.textContent = t('auth.login.resend_confirmation');
    }
  });
}

function _hideResendOption() {
  if (_resendContainer) { _resendContainer.remove(); _resendContainer = null; }
}

/* --------------------------------------------------------------------------
   Form submit
   -------------------------------------------------------------------------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideErrors();
  _hideResendOption();

  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }
  form.classList.remove('was-validated');

  Loader.setButtonLoading(submitBtn);
  try {
    const result = await AuthService.login(emailInput.value, passwordInput.value);
    setSession(result); /* stores tokens + redirects to dashboard */
  } catch (err) {
    if (err instanceof ApiError) {
      const msg = err.message || t('auth.login.error_invalid_credentials');
      showErrors([msg]);

      /* Offer resend link when backend says email is not confirmed */
      const emailNotConfirmedSignal = msg.toLowerCase().includes('confirm')
        || msg.includes('تأكيد');
      if (emailNotConfirmedSignal) {
        _showResendOption(emailInput.value);
      }
    }
    /* Network / infra errors already handled by api.js (toast shown) */
  } finally {
    Loader.clearButtonLoading(submitBtn);
  }
});

emailInput.addEventListener('input', hideErrors);
passwordInput.addEventListener('input', hideErrors);

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  initTheme();
  initLangSwitcher();
  await guardAnonymous();

  /* Show session-ended notice when redirected after revoking the current session */
  try {
    const notice = sessionStorage.getItem('mm.login_notice');
    if (notice === 'session_ended') {
      sessionStorage.removeItem('mm.login_notice');
      const noticeEl = document.getElementById('loginNotice');
      if (noticeEl) noticeEl.classList.remove('d-none');
    }
  } catch { /* localStorage/sessionStorage unavailable */ }
}

init();
